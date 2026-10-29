import { pool } from '../../../config/database.js';
import { cacheDel, cacheDelPattern, cacheKeys } from '../../../utils/cache.js';
import { logger } from '../../../utils/logger.js';
import { mapWithConcurrency } from '../../../utils/concurrency.js';
import type {
  DependencyRow,
  DependencySeverity,
  DependencySummary,
} from '../../../../shared/types.js';
import { parseDependencies, registryUrl, type ParsedDependency } from './parsers.js';
import { getLatestVersion } from './registries.js';
import { lookupAdvisories, maxSeverity } from './osv.js';
import { isOutdated } from './semver.js';

export const MAX_DEPENDENCIES = 300;
const CONCURRENCY = 8;
const LOOKUP_BUDGET_MS = 90_000;

export type CheckedDependency = ParsedDependency & {
  latestVersion: string | null;
  outdated: boolean;
  advisoryCount: number;
  maxSeverity: DependencySeverity | null;
  registryUrl: string;
};

export type DependencyCheckResult = {
  rows: CheckedDependency[];
  summary: DependencySummary;
};

function emptySeverity(): Record<DependencySeverity, number> {
  return { low: 0, moderate: 0, high: 0, critical: 0 };
}

export function summarizeDependencies(
  rows: CheckedDependency[],
  partial: boolean,
  checkedAt: string,
): DependencySummary {
  const severity = emptySeverity();
  let outdated = 0;
  let advisoryCount = 0;
  for (const row of rows) {
    if (row.outdated) outdated += 1;
    advisoryCount += row.advisoryCount;
    if (row.maxSeverity) {
      severity[row.maxSeverity] += row.advisoryCount;
    }
  }
  return {
    total: rows.length,
    checked: rows.filter((row) => row.latestVersion !== null).length,
    outdated,
    advisoryCount,
    severity,
    partial,
    checkedAt,
  };
}

export async function checkDependencies(
  input: ParsedDependency[],
  options: { force?: boolean } = {},
): Promise<DependencyCheckResult> {
  const deadline = Date.now() + LOOKUP_BUDGET_MS;
  const dependencies = input.slice(0, MAX_DEPENDENCIES);
  let partial = input.length > MAX_DEPENDENCIES;

  const latest = await mapWithConcurrency(
    dependencies,
    CONCURRENCY,
    async (dependency) => {
      if (Date.now() > deadline) {
        partial = true;
        return null;
      }
      return getLatestVersion(dependency, options);
    },
  );

  const osv = await lookupAdvisories(dependencies, options);
  partial ||= osv.partial;

  const rows: CheckedDependency[] = dependencies.map((dependency, index) => {
    const advisories = osv.advisories.get(
      `${dependency.ecosystem}:${dependency.name}@${dependency.version}`,
    ) ?? [];
    return {
      ...dependency,
      latestVersion: latest[index] ?? null,
      outdated: isOutdated(dependency.version, latest[index] ?? null),
      advisoryCount: advisories.length,
      maxSeverity: maxSeverity(advisories),
      registryUrl: registryUrl(dependency),
    };
  });

  return {
    rows,
    summary: summarizeDependencies(rows, partial, new Date().toISOString()),
  };
}

export async function collectDependencyHealth(
  configFiles: Record<string, string>,
): Promise<DependencyCheckResult> {
  const parsed = parseDependencies(configFiles);
  const result = await checkDependencies(parsed.dependencies);
  if (parsed.partial) result.summary.partial = true;
  return result;
}

export async function persistDependencyHealth(
  scanId: string,
  result: DependencyCheckResult,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const scan = await client.query<{ summary: Record<string, unknown> | null }>(
      `SELECT summary FROM scans WHERE id = $1 FOR UPDATE`,
      [scanId],
    );
    if (scan.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query('DELETE FROM scan_dependencies WHERE scan_id = $1', [
      scanId,
    ]);
    for (const row of result.rows) {
      await client.query(
        `INSERT INTO scan_dependencies
           (scan_id, ecosystem, package_name, current_version, latest_version,
            outdated, advisory_count, max_severity, registry_url, last_checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          scanId,
          row.ecosystem,
          row.name,
          row.version,
          row.latestVersion,
          row.outdated,
          row.advisoryCount,
          row.maxSeverity,
          row.registryUrl,
          result.summary.checkedAt,
        ],
      );
    }

    const summary = {
      ...(scan.rows[0]?.summary ?? {}),
      dependencyHealth: result.summary,
    };
    await client.query(`UPDATE scans SET summary = $2 WHERE id = $1`, [
      scanId,
      JSON.stringify(summary),
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function loadDependencyRows(scanId: string): Promise<DependencyRow[]> {
  const { rows } = await pool.query<{
    ecosystem: DependencyRow['ecosystem'];
    package_name: string;
    current_version: string;
    latest_version: string | null;
    outdated: boolean;
    advisory_count: number;
    max_severity: DependencySeverity | null;
    registry_url: string;
  }>(
    `SELECT ecosystem, package_name, current_version, latest_version, outdated,
            advisory_count, max_severity, registry_url
     FROM scan_dependencies
     WHERE scan_id = $1
     ORDER BY ecosystem, package_name, current_version`,
    [scanId],
  );
  return rows.map((row) => ({
    ecosystem: row.ecosystem,
    packageName: row.package_name,
    currentVersion: row.current_version,
    latestVersion: row.latest_version,
    outdated: row.outdated,
    advisoryCount: row.advisory_count,
    maxSeverity: row.max_severity,
    registryUrl: row.registry_url,
  }));
}

export async function refreshDependenciesForScan(
  scanId: string,
  repoId: string,
): Promise<DependencySummary | null> {
  const rows = await loadDependencyRows(scanId);
  if (rows.length === 0) return null;
  const parsed = rows.map<ParsedDependency>((row) => ({
    ecosystem: row.ecosystem,
    name: row.packageName,
    version: row.currentVersion,
  }));
  const result = await checkDependencies(parsed, { force: true });
  await persistDependencyHealth(scanId, result);
  try {
    await cacheDelPattern(cacheKeys.dependenciesPattern(repoId, scanId));
    await cacheDel(cacheKeys.overview(repoId, scanId));
    await cacheDel(cacheKeys.dependencySummary(repoId, scanId));
  } catch (err) {
    logger.warn(
      `Dependency cache invalidation failed for scan ${scanId}: ${(err as Error).message}`,
    );
  }
  return result.summary;
}
