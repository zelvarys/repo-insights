import { pool } from '../../config/database.js';
import { getTrackedRepository } from '../repositories/repository.service.js';
import { cacheGet, cacheSet, cacheKeys } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import { conflict, serviceUnavailable } from '../../utils/errors.js';
import type {
  CiHealth,
  CiHealthResponse,
  CommitActivity,
  CommitActivityResponse,
  ContributorConcentration,
  ContributorConcentrationResponse,
  DependenciesResponse,
  DependencyRow,
  DependencySummary,
  InsightAvailability,
  OverviewCards,
  OverviewResponse,
  RepoStructure,
  RepoStructureResponse,
} from '../../../shared/types.js';
import { selectActivity, type StoredActivity, type ActivityRange } from './activity.js';
import { aggregateCiHealth, filterCiRuns } from './ci.js';
import { loadCiRuns } from './ci.service.js';
import { computeRepoHealth } from './health-score.js';
import { loadDependencyRows } from './dependencies/service.js';
import { scanQueue } from '../scans/scan.queue.js';

const CACHE_TTL_SECONDS = 60;

type InsightScanRow = {
  id: string;
  completed_at: Date | null;
  summary: Record<string, unknown> | null;
  repo_tree: RepoStructure | null;
};

async function latestCompletedScan(repoId: string): Promise<InsightScanRow | null> {
  const { rows } = await pool.query<{
    id: string;
    completed_at: Date | null;
    summary: Record<string, unknown> | null;
    repo_tree: RepoStructure | null;
  }>(
    `SELECT id, completed_at, summary, repo_tree
     FROM scans
     WHERE repo_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT 1`,
    [repoId],
  );
  return rows[0] ?? null;
}

function unavailable(reason: string): InsightAvailability {
  return {
    available: false,
    scanId: null,
    completedAt: null,
    reason,
  };
}

async function cached<T>(
  key: string,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit) return hit;
  const value = await compute();
  try {
    await cacheSet(key, value, CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn(`insight cache write failed: ${(err as Error).message}`);
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export async function getRepoStructure(
  repoId: string,
): Promise<RepoStructureResponse> {
  await getTrackedRepository(repoId);
  const scan = await latestCompletedScan(repoId);
  if (!scan) return unavailable('no_scan');
  return cached(cacheKeys.structure(repoId, scan.id), async () => ({
    available: scan.repo_tree !== null,
    scanId: scan.id,
    completedAt: scan.completed_at?.toISOString() ?? null,
    ...(scan.repo_tree
      ? { structure: scan.repo_tree }
      : { reason: 'not_collected' }),
  }));
}

export async function getRepoActivity(
  repoId: string,
  range: ActivityRange,
): Promise<CommitActivityResponse> {
  await getTrackedRepository(repoId);
  const scan = await latestCompletedScan(repoId);
  if (!scan) return unavailable('no_scan');
  return cached(cacheKeys.activity(repoId, scan.id, range), async () => {
    const stored = asRecord(scan.summary?.activity) as StoredActivity | null;
    if (!stored || !stored.ranges || !stored.quality) {
      return {
        available: false,
        scanId: scan.id,
        completedAt: scan.completed_at?.toISOString() ?? null,
        reason: 'not_collected',
      };
    }
    return {
      available: true,
      scanId: scan.id,
      completedAt: scan.completed_at?.toISOString() ?? null,
      activity: selectActivity(stored, range) satisfies CommitActivity,
    };
  });
}

export async function getRepoConcentration(
  repoId: string,
): Promise<ContributorConcentrationResponse> {
  await getTrackedRepository(repoId);
  const scan = await latestCompletedScan(repoId);
  if (!scan) return unavailable('no_scan');
  return cached(cacheKeys.concentration(repoId, scan.id), async () => {
    const concentration = scan.summary?.concentration as
      | ContributorConcentration
      | null
      | undefined;
    return {
      available: Boolean(concentration),
      scanId: scan.id,
      completedAt: scan.completed_at?.toISOString() ?? null,
      ...(concentration
        ? { concentration }
        : { reason: 'not_collected' }),
    };
  });
}

export type CiFilters = {
  workflow?: string;
  branch?: string;
  range: 30 | 90 | 365;
};

export async function getRepoCi(
  repoId: string,
  filters: CiFilters,
): Promise<CiHealthResponse> {
  await getTrackedRepository(repoId);
  const scan = await latestCompletedScan(repoId);
  if (!scan) return unavailable('no_scan');
  const key = cacheKeys.ci(
    repoId,
    scan.id,
    `${filters.workflow ?? ''}|${filters.branch ?? ''}|${filters.range}`,
  );
  return cached(key, async () => {
    const stored = scan.summary?.ciHealth as CiHealth | null | undefined;
    if (!stored) {
      const ciError = scan.summary?.ciError;
      return {
        available: false,
        scanId: scan.id,
        completedAt: scan.completed_at?.toISOString() ?? null,
        reason: typeof ciError === 'string' ? 'github_unavailable' : 'no_workflows',
      };
    }
    const runs = await loadCiRuns(scan.id);
    const filtered = filterCiRuns(runs, {
      workflow: filters.workflow,
      branch: filters.branch,
      range: filters.range,
    });
    return {
      available: true,
      scanId: scan.id,
      completedAt: scan.completed_at?.toISOString() ?? null,
      ci: aggregateCiHealth(
        filtered,
        stored.partial,
        stored.fetchedAt,
      ) satisfies CiHealth,
    };
  });
}

export type DependencyFilters = {
  page: number;
  perPage: number;
  outdated?: boolean;
  hasAdvisory?: boolean;
};

export async function getRepoDependencies(
  repoId: string,
  filters: DependencyFilters,
): Promise<DependenciesResponse> {
  await getTrackedRepository(repoId);
  const scan = await latestCompletedScan(repoId);
  if (!scan) {
    return {
      ...unavailable('no_scan'),
      rows: [],
      pagination: { page: filters.page, perPage: filters.perPage, total: 0, hasMore: false },
    };
  }
  const filterKey = `${filters.page}|${filters.perPage}|${filters.outdated ?? ''}|${filters.hasAdvisory ?? ''}`;
  return cached(cacheKeys.dependencies(repoId, scan.id, filterKey), async () => {
    const summary = scan.summary?.dependencyHealth as
      | DependencySummary
      | null
      | undefined;
    if (!summary) {
      return {
        available: false,
        scanId: scan.id,
        completedAt: scan.completed_at?.toISOString() ?? null,
        reason: 'not_collected',
        rows: [],
        pagination: {
          page: filters.page,
          perPage: filters.perPage,
          total: 0,
          hasMore: false,
        },
      };
    }

    const conditions = ['scan_id = $1'];
    const params: unknown[] = [scan.id];
    if (filters.outdated !== undefined) {
      params.push(filters.outdated);
      conditions.push(`outdated = $${params.length}`);
    }
    if (filters.hasAdvisory !== undefined) {
      conditions.push(
        filters.hasAdvisory ? 'advisory_count > 0' : 'advisory_count = 0',
      );
    }
    const where = conditions.join(' AND ');
    const count = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM scan_dependencies WHERE ${where}`,
      params,
    );
    const total = count.rows[0]?.total ?? 0;
    params.push(filters.perPage, (filters.page - 1) * filters.perPage);
    const rows = await pool.query<{
      ecosystem: DependencyRow['ecosystem'];
      package_name: string;
      current_version: string;
      latest_version: string | null;
      outdated: boolean;
      advisory_count: number;
      max_severity: DependencyRow['maxSeverity'];
      registry_url: string;
    }>(
      `SELECT ecosystem, package_name, current_version, latest_version,
              outdated, advisory_count, max_severity, registry_url
       FROM scan_dependencies
       WHERE ${where}
       ORDER BY ecosystem, package_name, current_version
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      available: true,
      scanId: scan.id,
      completedAt: scan.completed_at?.toISOString() ?? null,
      summary,
      rows: rows.rows.map((row) => ({
        ecosystem: row.ecosystem,
        packageName: row.package_name,
        currentVersion: row.current_version,
        latestVersion: row.latest_version,
        outdated: row.outdated,
        advisoryCount: row.advisory_count,
        maxSeverity: row.max_severity,
        registryUrl: row.registry_url,
      })),
      pagination: {
        page: filters.page,
        perPage: filters.perPage,
        total,
        hasMore: filters.page * filters.perPage < total,
      },
    };
  });
}

export async function queueDependencyRefresh(
  repoId: string,
): Promise<{ queued: boolean; scanId: string }> {
  await getTrackedRepository(repoId);
  const scan = await latestCompletedScan(repoId);
  if (!scan) throw conflict('Run a scan before refreshing dependencies');
  const rows = await loadDependencyRows(scan.id);
  if (rows.length === 0) {
    throw conflict('No dependency data is available for the latest scan');
  }
  try {
    await scanQueue.add(
      'dependencies-refresh',
      { scanId: scan.id, repoId },
      {
        jobId: `deps-refresh-${scan.id}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  } catch (err) {
    logger.warn(
      `Dependency refresh enqueue failed for scan ${scan.id}: ${(err as Error).message}`,
    );
    throw serviceUnavailable('Dependency refresh queue is unavailable');
  }
  return { queued: true, scanId: scan.id };
}

export async function getRepoOverview(
  repoId: string,
): Promise<OverviewResponse> {
  await getTrackedRepository(repoId);
  const scan = await latestCompletedScan(repoId);
  if (!scan) return unavailable('no_scan');
  return cached(cacheKeys.overview(repoId, scan.id), async () => {
    const activity = asRecord(scan.summary?.activity) as StoredActivity | null;
    const concentration = scan.summary?.concentration as
      | ContributorConcentration
      | undefined;
    const ciHealth = scan.summary?.ciHealth as CiHealth | null | undefined;
    const dependencies = scan.summary?.dependencyHealth as
      | DependencySummary
      | undefined;

    const last90 = activity?.ranges?.[90]?.daily ?? {};
    const sparkline = Object.entries(last90)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const commitsLast90 = sparkline.reduce((sum, point) => sum + point.count, 0);
    const quality = activity?.quality;

    const health = computeRepoHealth({
      commitsLast90,
      dependencies: dependencies ?? null,
      ciSuccessRate: ciHealth?.successRate ?? null,
      ciTotalRuns: ciHealth?.totalRuns ?? null,
      concentration: concentration ?? null,
      quality: quality ?? null,
    });

    const cards: OverviewCards = {
      ...(concentration ? { concentration } : {}),
      ...(ciHealth
        ? {
            ci: {
              available: true,
              successRate: ciHealth.successRate,
              worstWorkflow:
                [...ciHealth.workflows]
                  .filter((workflow) => workflow.totalRuns > 10)
                  .sort((a, b) => a.successRate - b.successRate)[0]?.name ??
                null,
            },
          }
        : {}),
      ...(dependencies
        ? {
            dependencies: {
              total: dependencies.total,
              outdated: dependencies.outdated,
              advisoryCount: dependencies.advisoryCount,
              partial: dependencies.partial,
            },
          }
        : {}),
      ...(activity
        ? { activity: { last90Commits: commitsLast90, sparkline } }
        : {}),
      ...(quality ? { commitQuality: quality } : {}),
    };

    return {
      available: true,
      scanId: scan.id,
      completedAt: scan.completed_at?.toISOString() ?? null,
      health,
      cards,
    };
  });
}
