import { pool } from '../../config/database.js';
import { getTrackedRepository } from '../repositories/repository.service.js';
import { cacheGet, cacheSet, cacheKeys } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import {
  computeScore,
  detectLanguages,
  isToolRelevant,
  languagesFromArray,
  languagesToArray,
  type DetectedLanguages,
} from './scoring.js';
import type {
  ToolMetric,
  RepoMetrics,
  ToolCategory,
} from '../../../shared/types.js';

const METRICS_CACHE_TTL_SECONDS = 60;

async function loadCachedContext(
  scanId: string,
): Promise<import('../scans/scan.context.js').ScanContext | null> {
  try {
    const mod = await import('../scans/scan.context.js');
    return await mod.loadScanContext(scanId);
  } catch {
    return null;
  }
}

async function computeRepoMetrics(repoId: string): Promise<RepoMetrics> {
  const repo = await getTrackedRepository(repoId);

  const latestScan = await pool.query<{
    id: string;
    completed_at: Date | null;
    languages: string[] | null;
  }>(
    `SELECT id, completed_at, languages
     FROM scans
     WHERE repo_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT 1`,
    [repoId],
  );

  const scan = latestScan.rows[0];
  if (!scan) {
    return computeScore([], new Set(), {
      repoId: repo.id,
      repoFullName: repo.fullName,
      scanId: null,
      scanCompletedAt: null,
      languages: [],
    });
  }

  const toolRows = await pool.query<{
    tool_name: string;
    category: string;
    detected: boolean;
    adoption_rate: string | number;
    evidence: Record<string, unknown> | null;
  }>(
    `SELECT tool_name, category, detected, adoption_rate, evidence
     FROM tool_usage
     WHERE scan_id = $1 AND contributor_login IS NULL
     ORDER BY tool_name`,
    [scan.id],
  );

  const contributorRows = await pool.query<{
    tool_name: string;
    adoption_rate: string | number;
  }>(
    `SELECT tool_name, adoption_rate
     FROM tool_usage
     WHERE scan_id = $1 AND contributor_login IS NOT NULL`,
    [scan.id],
  );

  const trackedRows = await pool.query<{
    tool_name: string;
    enabled: boolean;
  }>(
    `SELECT tool_name, enabled FROM tracked_tools WHERE repo_id = $1`,
    [repoId],
  );
  const trackedMap = new Map<string, boolean>();
  for (const r of trackedRows.rows) trackedMap.set(r.tool_name, r.enabled);

  const perToolStats = new Map<
    string,
    { contributorCount: number; contributorsUsing: number }
  >();
  for (const row of contributorRows.rows) {
    const entry = perToolStats.get(row.tool_name) ?? {
      contributorCount: 0,
      contributorsUsing: 0,
    };
    entry.contributorCount += 1;
    const rate = Number(row.adoption_rate);
    if (rate > 0) entry.contributorsUsing += 1;
    perToolStats.set(row.tool_name, entry);
  }

  let languages: DetectedLanguages;
  if (scan.languages !== null) {
    languages = languagesFromArray(scan.languages);
  } else {
    const ctx = await loadCachedContext(scan.id);
    if (ctx) {
      const commitFilenames = ctx.commits.flatMap((c) =>
        c.files.map((f) => f.filename),
      );
      languages = detectLanguages({
        rootFiles: ctx.rootFiles,
        commitFilenames,
        configFileKeys: Object.keys(ctx.configFiles),
      });
    } else {
      const detectedNames = new Set(
        toolRows.rows.filter((r) => r.detected).map((r) => r.tool_name),
      );
      languages = {
        js:
          detectedNames.has('jest') ||
          detectedNames.has('eslint') ||
          detectedNames.has('prettier'),
        python:
          detectedNames.has('pytest') ||
          detectedNames.has('black') ||
          detectedNames.has('ruff'),
        go:
          detectedNames.has('go-test') || detectedNames.has('golangci-lint'),
        php: detectedNames.has('phpunit'),
      };
    }
  }

  const tools: ToolMetric[] = toolRows.rows.map((row) => {
    const stats = perToolStats.get(row.tool_name);
    const tracked = trackedMap.get(row.tool_name) === true;
    return {
      name: row.tool_name,
      category: row.category as ToolCategory,
      detected: row.detected,
      relevant: isToolRelevant(row.tool_name, languages),
      tracked,
      adoptionRate: Number(row.adoption_rate),
      contributorCount: stats?.contributorCount ?? 0,
      contributorsUsing: stats?.contributorsUsing ?? 0,
      countsTowardScore: true,
      evidence: row.evidence,
    };
  });

  const enabledToolNames = new Set(
    [...trackedMap.entries()]
      .filter(([, enabled]) => enabled)
      .map(([name]) => name),
  );

  return computeScore(tools, enabledToolNames, {
    repoId: repo.id,
    repoFullName: repo.fullName,
    scanId: scan.id,
    scanCompletedAt: scan.completed_at?.toISOString() ?? null,
    languages: languagesToArray(languages),
  });
}

export async function getRepoMetrics(repoId: string): Promise<RepoMetrics> {
  const latest = await pool.query<{ id: string }>(
    `SELECT id FROM scans
     WHERE repo_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT 1`,
    [repoId],
  );
  const scanId = latest.rows[0]?.id;

  if (scanId) {
    const key = cacheKeys.metrics(repoId, scanId);
    const cached = await cacheGet<RepoMetrics>(key);
    if (cached) return cached;

    const metrics = await computeRepoMetrics(repoId);
    try {
      await cacheSet(key, metrics, METRICS_CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn(`metrics cache write failed: ${(err as Error).message}`);
    }
    return metrics;
  }

  return computeRepoMetrics(repoId);
}