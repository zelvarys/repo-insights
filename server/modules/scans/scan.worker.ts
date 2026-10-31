import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../../config/redis.js';
import { pool } from '../../config/database.js';
import {
  SCAN_QUEUE_NAME,
  type DependencyRefreshJobData,
  type ScanJobData,
  type ScanQueueJobData,
} from './scan.queue.js';
import { logger } from '../../utils/logger.js';
import { getAccessTokenForUser } from '../auth/auth.service.js';
import {
  fetchRecentCommits,
  fetchCommitDetail,
  fetchContributors,
  fetchRepoTree,
  fetchWorkflowRuns,
  listContents,
  readFileText,
} from '../../integrations/github/github.client.js';
import {
  saveScanContext,
  type ScanContext,
  type CommitInfo,
  type CommitFile,
} from './scan.context.js';
import { detectors } from '../tools/detector.registry.js';
import type { DetectionResult } from '../tools/detector.interface.js';
import { backfillTrackedToolsFromScan } from '../tracked-tools/tracked-tools.service.js';
import {
  cacheCompletedScan,
  invalidateScanCache,
} from './scan.service.js';
import {
  computeScore,
  detectLanguages,
  isToolRelevant,
  languagesToArray,
} from '../metrics/scoring.js';
import type { ScanSummary, ToolMetric } from '../../../shared/types.js';
import { buildCommitActivity } from '../insights/activity.js';
import { computeConcentration } from '../insights/concentration.js';
import { aggregateCiHealth } from '../insights/ci.js';
import { persistCiRuns } from '../insights/ci.service.js';
import { buildRepoStructure, type RawTreeEntry } from '../insights/structure.js';
import { computeRepoHealth } from '../insights/health-score.js';
import {
  collectDependencyHealth,
  persistDependencyHealth,
  refreshDependenciesForScan,
} from '../insights/dependencies/service.js';

const MAX_COMMIT_DETAIL_LOOKUPS = 30;
const MAX_CONTRIBUTORS_PAGES = 2;
const MAX_COMMITS_PAGES = 10;
const ACTIVITY_WINDOW_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const CONFIG_FILE_CANDIDATES = [
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs',
  '.eslintrc.yml', '.eslintrc.yaml',
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
  '.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs',
  '.prettierrc.yml', '.prettierrc.yaml',
  'prettier.config.js', 'prettier.config.cjs',
  'jest.config.js', 'jest.config.ts', 'jest.config.mjs',
  'jest.config.cjs', 'jest.config.json',
  'pyproject.toml', 'setup.cfg', 'setup.py', 'requirements.txt',
  'requirements-dev.txt', 'dev-requirements.txt', 'Pipfile',
  'pytest.ini', 'tox.ini', 'ruff.toml', '.ruff.toml',
  'go.mod', 'go.sum',
  '.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json',
  'composer.json', 'composer.lock', 'phpunit.xml', 'phpunit.xml.dist',
  'Gemfile', 'Gemfile.lock', '.rubocop.yml',
  'mkdocs.yml', 'docusaurus.config.js', 'docusaurus.config.ts',
];

const CONFIG_SUBDIR_CANDIDATES = [
  { path: '.github/dependabot.yml' },
  { path: '.github/dependabot.yaml' },
  { path: '.github/renovate.json' },
  { path: '.github/renovate.json5' },
  { path: 'renovate.json' },
  { path: 'renovate.json5' },
  { path: '.renovaterc' },
  { path: '.renovaterc.json' },
  { path: '.pre-commit-config.yaml' },
  { path: '.coveralls.yml' },
  { path: 'codecov.yml' },
  { path: '.codecov.yml' },
];

async function buildScanContext(
  token: string,
  scanId: string,
  repoId: string,
  owner: string,
  name: string,
  defaultBranch: string,
): Promise<ScanContext> {
  const contributorsRaw = await fetchContributors(
    token, owner, name, MAX_CONTRIBUTORS_PAGES,
  );
  const contributors = contributorsRaw.map((c) => ({
    login: c.login, contributions: c.contributions,
  }));

  const commitsRaw = await fetchRecentCommits(
    token, owner, name, defaultBranch, MAX_COMMITS_PAGES,
  );

  const commits: CommitInfo[] = [];
  const commitHistory: CommitInfo[] = commitsRaw.map((commit) => ({
    sha: commit.sha,
    authorLogin: commit.author?.login ?? null,
    message: commit.commit.message,
    date: commit.commit.author?.date ?? new Date().toISOString(),
    files: [],
  }));
  const detailTargets = commitsRaw.slice(0, MAX_COMMIT_DETAIL_LOOKUPS);

  for (const commit of detailTargets) {
    const detail = await fetchCommitDetail(token, owner, name, commit.sha);
    const files: CommitFile[] = (detail.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    }));

    commits.push({
      sha: commit.sha,
      authorLogin: commit.author?.login ?? null,
      message: commit.commit.message,
      date: commit.commit.author?.date ?? new Date().toISOString(),
      files,
    });
  }

  let tree: RawTreeEntry[] | undefined;
  let treeTruncated = false;
  try {
    const treeResponse = await fetchRepoTree(token, owner, name, defaultBranch);
    tree = treeResponse.tree.map((entry) => ({
      path: entry.path,
      type: entry.type,
      size: entry.size,
      sha: entry.sha,
    }));
    treeTruncated = treeResponse.truncated;
  } catch (err) {
    logger.warn(
      `Tree fetch failed for ${owner}/${name}: ${(err as Error).message}`,
    );
  }

  const root = await listContents(token, owner, name, '', defaultBranch);
  const rootFiles = root.filter((e) => e.type === 'file').map((e) => e.name);

  const configFiles: Record<string, string> = {};
  for (const path of CONFIG_FILE_CANDIDATES) {
    if (!rootFiles.includes(path)) continue;
    const content = await readFileText(token, owner, name, path, defaultBranch);
    if (content !== null) configFiles[path] = content;
  }
  for (const { path } of CONFIG_SUBDIR_CANDIDATES) {
    const content = await readFileText(token, owner, name, path, defaultBranch);
    if (content !== null) configFiles[path] = content;
  }

  const workflowEntries = await listContents(
    token, owner, name, '.github/workflows', defaultBranch,
  );
  const workflowFiles = workflowEntries
    .filter((e) => e.type === 'file')
    .map((e) => `.github/workflows/${e.name}`);

  for (const wf of workflowFiles) {
    if (wf in configFiles) continue;
    const content = await readFileText(token, owner, name, wf, defaultBranch);
    if (content !== null) configFiles[wf] = content;
  }

  let ciRuns: import('../insights/ci.js').CiRun[] | undefined;
  let ciPartial = false;
  let ciError: string | undefined;
  if (workflowFiles.length > 0) {
    try {
      const runs = await fetchWorkflowRuns(token, owner, name, 3);
      ciRuns = runs.map((run) => {
        const startedAt = run.run_started_at ?? run.created_at;
        const completedAt = run.status === 'completed' ? run.updated_at : null;
        const startMs = Date.parse(startedAt);
        const endMs = completedAt ? Date.parse(completedAt) : NaN;
        return {
          runId: run.id,
          workflowName: run.name ?? run.display_title ?? 'Workflow',
          status: run.status,
          conclusion: run.conclusion,
          branch: run.head_branch,
          actor: run.actor?.login ?? null,
          startedAt,
          completedAt,
          durationSeconds:
            Number.isFinite(startMs) && Number.isFinite(endMs)
              ? Math.max(0, Math.round((endMs - startMs) / 1000))
              : null,
          url: run.html_url,
        };
      });
      ciPartial = runs.length >= 300;
    } catch (err) {
      ciRuns = [];
      ciPartial = true;
      ciError = (err as Error).message;
      logger.warn(
        `Workflow runs fetch failed for ${owner}/${name}: ${ciError}`,
      );
    }
  }

  return {
    scanId, repoId, owner, name, defaultBranch,
    fetchedAt: new Date().toISOString(),
    commits, commitHistory, contributors, rootFiles, configFiles, workflowFiles,
    tree, treeTruncated, ciRuns, ciPartial, ciError,
  };
}

async function runDetectors(ctx: ScanContext): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  for (const detector of detectors) {
    try {
      results.push(await detector.detect(ctx));
    } catch (err) {
      logger.warn(`Detector ${detector.name} failed: ${(err as Error).message}`);
    }
  }
  return results;
}

async function persistToolUsage(
  scanId: string,
  repoId: string,
  results: DetectionResult[],
): Promise<void> {
  if (results.length === 0) return;
  await pool.query('DELETE FROM tool_usage WHERE scan_id = $1', [scanId]);

  for (const r of results) {
    await pool.query(
      `INSERT INTO tool_usage
         (scan_id, repo_id, tool_name, category, detected, adoption_rate,
          contributor_id, contributor_login, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7)`,
      [scanId, repoId, r.tool, r.category, r.detected, r.adoptionRate,
       JSON.stringify(r.evidence)],
    );

    if (r.perContributor) {
      for (const [login, used] of Object.entries(r.perContributor)) {
        await pool.query(
          `INSERT INTO tool_usage
             (scan_id, repo_id, tool_name, category, detected, adoption_rate,
              contributor_id, contributor_login, evidence)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)`,
          [scanId, repoId, r.tool, r.category, r.detected,
           used ? 100 : 0, login, JSON.stringify({ contributorEvidence: used })],
        );
      }
    }
  }
}

async function processScanJob(job: {
  data: ScanJobData;
  attemptsMade?: number;
  opts?: { attempts?: number };
}): Promise<void> {
  const { scanId, repoId, requestedBy } = job.data;
  logger.info(`Worker picked up scan ${scanId} for repo ${repoId}`);

  await pool.query(
    `UPDATE scans SET status = 'running', started_at = NOW() WHERE id = $1`,
    [scanId],
  );

  try {
    const repoRow = await pool.query<{
      owner: string; name: string; default_branch: string;
    }>(
      `SELECT owner, name, default_branch FROM repositories WHERE id = $1`,
      [repoId],
    );
    const repo = repoRow.rows[0];
    if (!repo) {
      logger.warn(
        `Repository ${repoId} was removed before scan ${scanId} started`,
      );
      await pool.query(
        `UPDATE scans
         SET status = 'failed', completed_at = NOW(), error = 'Repository removed'
         WHERE id = $1`,
        [scanId],
      );
      return;
    }

    const token = await getAccessTokenForUser(requestedBy);
    if (!token) {
      throw new Error(`No GitHub token available for user ${requestedBy}`);
    }

    const ctx = await buildScanContext(
      token, scanId, repoId, repo.owner, repo.name, repo.default_branch,
    );
    await saveScanContext(ctx);

    const results = await runDetectors(ctx);
    await persistToolUsage(scanId, repoId, results);

    const languages = detectLanguages({
      rootFiles: ctx.rootFiles,
      commitFilenames: ctx.commits.flatMap((c) =>
        c.files.map((f) => f.filename),
      ),
      configFileKeys: Object.keys(ctx.configFiles),
    });
    try {
      await backfillTrackedToolsFromScan(
        repoId,
        results.map((r) => ({
          toolName: r.tool, detected: r.detected, category: r.category,
        })),
        languages,
      );
    } catch (err) {
      logger.warn(
        `tracked_tools backfill failed for repo ${repoId}: ${(err as Error).message}`,
      );
    }

    const trackedRows = await pool.query<{ tool_name: string }>(
      `SELECT tool_name FROM tracked_tools WHERE repo_id = $1 AND enabled = TRUE`,
      [repoId],
    );
    const trackedNames = new Set(trackedRows.rows.map((r) => r.tool_name));

    const summaryTools: ToolMetric[] = results
      .map((result) => {
        const perContributor = result.perContributor ?? {};
        const logins = Object.keys(perContributor);
        return {
          name: result.tool,
          category: result.category,
          detected: result.detected,
          relevant: isToolRelevant(result.tool, languages),
          tracked: trackedNames.has(result.tool),
          adoptionRate: result.adoptionRate,
          contributorCount: logins.length,
          contributorsUsing: logins.filter((login) => perContributor[login])
            .length,
          countsTowardScore: true,
          evidence: result.evidence,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const now = new Date();
    const cutoff = now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS;
    const activity = ctx.commitHistory
      ? buildCommitActivity(
          ctx.commitHistory.map((commit) => ({
            sha: commit.sha,
            authorLogin: commit.authorLogin,
            message: commit.message,
            date: commit.date,
          })),
          now,
        )
      : undefined;
    const concentration = ctx.commitHistory
      ? computeConcentration(
          ctx.commitHistory
            .filter((commit) => Date.parse(commit.date) >= cutoff)
            .map((commit) => ({ authorLogin: commit.authorLogin })),
        )
      : undefined;
    const lastModifiedByPath: Record<string, string> = {};
    for (const commit of ctx.commits) {
      for (const file of commit.files) {
        if (!(file.filename in lastModifiedByPath)) {
          lastModifiedByPath[file.filename] = commit.date;
        }
      }
    }
    const structure = ctx.tree
      ? buildRepoStructure(ctx.tree, lastModifiedByPath, ctx.treeTruncated)
      : undefined;
    const ciHealth = ctx.ciRuns
      ? aggregateCiHealth(ctx.ciRuns, ctx.ciPartial ?? false, now.toISOString())
      : null;
    let dependencyResult:
      | Awaited<ReturnType<typeof collectDependencyHealth>>
      | null = null;
    try {
      dependencyResult = await collectDependencyHealth(ctx.configFiles);
    } catch (err) {
      logger.warn(
        `Dependency health failed for scan ${scanId}: ${(err as Error).message}`,
      );
    }

    const daily90 = activity?.ranges[90].daily ?? {};
    const commitsLast90 = Object.values(daily90).reduce(
      (sum, count) => sum + count,
      0,
    );
    const health = computeRepoHealth({
      commitsLast90,
      dependencies: dependencyResult?.summary ?? null,
      ciSuccessRate: ciHealth?.successRate ?? null,
      ciTotalRuns: ciHealth?.totalRuns ?? null,
      concentration: concentration ?? null,
      quality: activity?.quality ?? null,
    });

    const summary: Record<string, unknown> = {
      ...computeScore(summaryTools, trackedNames, {
        repoId,
        repoFullName: `${repo.owner}/${repo.name}`,
        scanId,
        scanCompletedAt: null,
        languages: languagesToArray(languages),
      }),
      health,
      ciHealth,
      ciError: ctx.ciError ?? null,
      ...(activity ? { activity } : {}),
      ...(concentration ? { concentration } : {}),
      ...(dependencyResult
        ? { dependencyHealth: dependencyResult.summary }
        : {}),
    };

    if (ctx.ciRuns && ctx.ciRuns.length > 0) {
      try {
        await persistCiRuns(scanId, ctx.ciRuns);
      } catch (err) {
        logger.warn(
          `CI run persistence failed for scan ${scanId}: ${(err as Error).message}`,
        );
      }
    }

    const completed = await pool.query(
      `UPDATE scans
       SET status = 'complete', completed_at = NOW(), summary = $2,
           languages = $3, repo_tree = $4
       WHERE id = $1
       RETURNING id, repo_id, status, started_at, completed_at, error,
                 summary, created_at`,
      [
        scanId,
        JSON.stringify(summary),
        languagesToArray(languages),
        structure ? JSON.stringify(structure) : null,
      ],
    );

    const row = completed.rows[0];
    if (row) {
      const scanRow: ScanSummary = {
        id: row.id, repoId: row.repo_id,
        status: row.status, startedAt: row.started_at?.toISOString() ?? null,
        completedAt: row.completed_at?.toISOString() ?? null,
        error: row.error, summary: row.summary,
        createdAt: row.created_at.toISOString(),
      };
      try {
        await cacheCompletedScan(scanRow);
      } catch (err) {
        logger.warn(`Failed to cache scan ${scanId}: ${(err as Error).message}`);
      }
    }

    if (dependencyResult) {
      try {
        await persistDependencyHealth(scanId, dependencyResult);
      } catch (err) {
        logger.warn(
          `Dependency persistence failed for scan ${scanId}: ${(err as Error).message}`,
        );
      }
    }

    logger.info(
      `Scan ${scanId} complete — ${results.length} tools checked, ` +
        `${results.filter((r) => r.detected).length} detected`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFinalAttempt =
      (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1);

    if (!isFinalAttempt) {
      logger.warn(`Scan ${scanId} failed and will retry: ${message}`);
      throw err;
    }

    await pool.query(
      `UPDATE scans SET status = 'failed', completed_at = NOW(), error = $2
       WHERE id = $1`,
      [scanId, message],
    );

    let failedScan: { createdAt: string } | undefined;
    try {
      const meta = await pool.query<{ created_at: Date }>(
        `SELECT created_at FROM scans WHERE id = $1`,
        [scanId],
      );
      const createdAt = meta.rows[0]?.created_at;
      if (createdAt) failedScan = { createdAt: createdAt.toISOString() };
    } catch (metaErr) {
      logger.warn(
        `Failed to read scan ${scanId} timestamp: ${(metaErr as Error).message}`,
      );
    }

    try {
      await invalidateScanCache(repoId, failedScan);
    } catch (cacheErr) {
      logger.warn(
        `Failed to invalidate cache for repo ${repoId}: ${(cacheErr as Error).message}`,
      );
    }
    logger.error(`Scan ${scanId} failed: ${message}`);
    throw err;
  }
}

export async function processDependencyRefreshJob(job: {
  data: DependencyRefreshJobData;
}): Promise<void> {
  const { scanId, repoId } = job.data;
  logger.info(`Worker picked up dependency refresh for scan ${scanId}`);
  await refreshDependenciesForScan(scanId, repoId);
}

export function startWorker(): Worker<ScanQueueJobData> {
  const worker = new Worker<ScanQueueJobData>(
    SCAN_QUEUE_NAME,
    async (job: Job<ScanQueueJobData>) => {
      if (job.name === 'dependencies-refresh') {
        await processDependencyRefreshJob({
          data: job.data as DependencyRefreshJobData,
        });
        return;
      }
      await processScanJob({ data: job.data as ScanJobData });
    },
    { connection: createRedisConnection(), concurrency: 2 },
  );
  worker.on('ready', () =>
    logger.info(`Scan worker ready (queue: ${SCAN_QUEUE_NAME})`),
  );
  worker.on('failed', (job, err) =>
    logger.error(`Job ${job?.id} failed: ${err.message}`),
  );
  worker.on('error', (err) => {
    logger.error(`Scan worker error: ${err.message}`);
  });
  worker.on('stalled', (jobId) => {
    logger.warn(`Scan job ${jobId} stalled`);
  });
  return worker;
}

export async function processScanJobForTests(job: { data: ScanJobData }): Promise<void> {
  await processScanJob(job);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = startWorker();
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — closing scan worker`);
    await worker.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}