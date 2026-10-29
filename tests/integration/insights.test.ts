import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { ScanSummary } from '../../shared/types.js';
import { createApp } from '../../server/app.js';
import { pool, closeDb } from '../../server/config/database.js';
import { closeRedis } from '../../server/config/redis.js';
import { env } from '../../server/config/env.js';
import { encryptToken } from '../../server/utils/crypto.js';
import { signJwt, parseExpiresIn } from '../../server/utils/jwt.js';
import { processDependencyRefreshJob } from '../../server/modules/scans/scan.worker.js';
import { scanQueue } from '../../server/modules/scans/scan.queue.js';
import { insertRepository, insertUser, truncateAll } from '../helpers/db.js';

let app: Express;
let token: string;
let userId: string;
let repoId: string;
let scanId: string;

const now = new Date();
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const day = (days: number) => daysAgo(days).slice(0, 10);

const quality = {
  totalCommits: 4,
  conventionalPercent: 75,
  bodyPercent: 25,
  averageMessageLength: 18,
  averageBodyLength: 12,
  mostCommonType: 'feat',
  examples: ['update docs'],
  messageLengthBuckets: [{ label: '1-20', count: 4 }],
};

const daily = { [day(0)]: 2, [day(1)]: 1, [day(30)]: 1 };
const storedActivity = {
  quality,
  ranges: Object.fromEntries(
    [90, 180, 365].map((range) => [
      range,
      {
        daily,
        weekly: [{ weekStart: day(7), count: 4 }],
        topContributors: [
          { login: 'alice', commits: 3 },
          { login: 'bob', commits: 1 },
        ],
        weekday: [1, 1, 0, 0, 2, 0, 0],
        hourOfDay: Array.from({ length: 24 }, () => 0),
      },
    ]),
  ),
};

const concentration = {
  totalCommits: 4,
  contributorCount: 2,
  top1Share: 75,
  top3Share: 100,
  top10Share: 100,
  gini: 0.5,
  risk: 'red' as const,
  topContributors: [
    { login: 'alice', commits: 3, share: 75 },
    { login: 'bob', commits: 1, share: 25 },
  ],
};

const ciHealth = {
  successRate: 50,
  totalRuns: 23,
  workflows: [
    {
      name: 'CI',
      totalRuns: 12,
      successfulRuns: 1,
      failedRuns: 11,
      successRate: 8.33,
      averageDurationSeconds: 60,
    },
    {
      name: 'Deploy',
      totalRuns: 11,
      successfulRuns: 10,
      failedRuns: 1,
      successRate: 90.91,
      averageDurationSeconds: 30,
    },
  ],
  recentFailures: [],
  partial: false,
  fetchedAt: now.toISOString(),
};

const dependencyHealth = {
  total: 2,
  checked: 2,
  outdated: 1,
  advisoryCount: 1,
  severity: { low: 0, moderate: 0, high: 0, critical: 1 },
  partial: false,
  checkedAt: now.toISOString(),
};

const repoTree = {
  fileCount: 3,
  directoryCount: 2,
  totalSize: 120,
  truncated: false,
  fileTypes: [{ extension: '.ts', count: 2, sizeBytes: 100 }],
  tree: [
    {
      name: 'src',
      path: 'src',
      type: 'dir',
      size: 100,
      lastModified: null,
      fileCount: 2,
      children: [
        { name: 'index.ts', path: 'src/index.ts', type: 'file', size: 80, lastModified: null },
        { name: 'util.ts', path: 'src/util.ts', type: 'file', size: 20, lastModified: null },
      ],
    },
  ],
};

const summary = {
  adoptionScore: 82,
  activity: storedActivity,
  concentration,
  ciHealth,
  dependencyHealth,
  ciError: null,
} satisfies ScanSummary;

async function seedInsights(): Promise<void> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO scans (repo_id, status, completed_at, summary, repo_tree)
     VALUES ($1, 'complete', NOW(), $2, $3) RETURNING id`,
    [repoId, JSON.stringify(summary), JSON.stringify(repoTree)],
  );
  scanId = result.rows[0]!.id;

  await pool.query(
    `INSERT INTO scan_ci_runs
       (scan_id, run_id, workflow_name, status, conclusion, branch, actor,
        url, started_at, completed_at, duration_seconds)
     VALUES
       ($1, 1, 'CI', 'completed', 'success', 'main', 'alice', 'https://example.com/1', $2, $2, 40),
       ($1, 2, 'CI', 'completed', 'failure', 'main', 'bob', 'https://example.com/2', $3, $3, 60),
       ($1, 3, 'CI', 'completed', 'success', 'dev', 'carol', 'https://example.com/3', $4, $4, 80),
       ($1, 4, 'Deploy', 'completed', 'success', 'main', 'alice', 'https://example.com/4', $5, $5, 30)`,
    [scanId, daysAgo(1), daysAgo(2), daysAgo(3), daysAgo(4)],
  );

  await pool.query(
    `INSERT INTO scan_dependencies
       (scan_id, ecosystem, package_name, current_version, latest_version,
        outdated, advisory_count, max_severity, registry_url, last_checked_at)
     VALUES
       ($1, 'npm', 'alpha', '1.0.0', '2.0.0', TRUE, 1, 'critical', 'https://www.npmjs.com/package/alpha', NOW()),
       ($1, 'pypi', 'beta', '3.0.0', '3.0.0', FALSE, 0, NULL, 'https://pypi.org/project/beta/', NOW())`,
    [scanId],
  );
}

function auth(req: request.Test): request.Test {
  return req.set('Cookie', `token=${token}`);
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  vi.unstubAllGlobals();
  userId = await insertUser({
    githubId: 1000,
    username: 'insight-tester',
    accessTokenCiphertext: encryptToken('gho_test_token'),
  });
  repoId = await insertRepository({
    githubId: 2000,
    owner: 'test',
    name: 'insights',
    addedBy: userId,
  });
  token = signJwt(userId, parseExpiresIn(env.JWT_EXPIRES_IN));
  await seedInsights();
});

afterAll(async () => {
  await truncateAll();
  await scanQueue.close();
  await closeDb();
  await closeRedis();
});

describe('repository insight endpoints', () => {
  it('returns structure', async () => {
    const res = await auth(request(app).get(`/repos/${repoId}/structure`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      available: true,
      scanId,
      structure: { fileCount: 3, directoryCount: 2 },
    });
  });

  it('returns activity for the requested range', async () => {
    const res = await auth(
      request(app).get(`/repos/${repoId}/activity?range=90`),
    );
    expect(res.status).toBe(200);
    expect(res.body.activity.range).toBe(90);
    expect(res.body.activity.daily[day(0)]).toBe(2);
    expect(res.body.activity.quality.mostCommonType).toBe('feat');
    expect(res.body.activity.weekday).toHaveLength(7);
    expect(res.body.activity.hourOfDay).toHaveLength(24);
  });

  it('rejects an invalid activity range', async () => {
    const res = await auth(
      request(app).get(`/repos/${repoId}/activity?range=42`),
    );
    expect(res.status).toBe(400);
  });

  it('returns contributor concentration', async () => {
    const res = await auth(request(app).get(`/repos/${repoId}/concentration`));
    expect(res.status).toBe(200);
    expect(res.body.concentration).toMatchObject({
      top1Share: 75,
      top3Share: 100,
      risk: 'red',
    });
  });

  it('aggregates persisted CI runs and applies filters', async () => {
    const all = await auth(request(app).get(`/repos/${repoId}/ci?range=365`));
    expect(all.status).toBe(200);
    expect(all.body.ci.totalRuns).toBe(4);
    expect(all.body.ci.successRate).toBe(75);
    expect(all.body.ci.workflows).toHaveLength(2);

    const filtered = await auth(
      request(app).get(`/repos/${repoId}/ci?workflow=CI&branch=main&range=365`),
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.ci.totalRuns).toBe(2);
    expect(filtered.body.ci.successRate).toBe(50);
  });

  it('paginates and filters dependencies', async () => {
    const all = await auth(
      request(app).get(`/repos/${repoId}/dependencies?perPage=1`),
    );
    expect(all.status).toBe(200);
    expect(all.body.available).toBe(true);
    expect(all.body.summary.total).toBe(2);
    expect(all.body.pagination).toEqual({
      page: 1,
      perPage: 1,
      total: 2,
      hasMore: true,
    });
    expect(all.body.rows).toHaveLength(1);
    expect(all.body.rows[0].registryUrl).toContain('npmjs.com');

    const page2 = await auth(
      request(app).get(`/repos/${repoId}/dependencies?perPage=1&page=2`),
    );
    expect(page2.body.rows).toHaveLength(1);
    expect(page2.body.pagination.hasMore).toBe(false);

    const outdated = await auth(
      request(app).get(`/repos/${repoId}/dependencies?outdated=true`),
    );
    expect(outdated.body.rows).toHaveLength(1);
    expect(outdated.body.rows[0].packageName).toBe('alpha');

    const advisories = await auth(
      request(app).get(`/repos/${repoId}/dependencies?hasAdvisory=true`),
    );
    expect(advisories.body.rows).toHaveLength(1);
    expect(advisories.body.rows[0].maxSeverity).toBe('critical');
  });

  it('rejects invalid pagination and boolean filters', async () => {
    expect(
      (await auth(request(app).get(`/repos/${repoId}/dependencies?perPage=500`))).status,
    ).toBe(400);
    expect(
      (await auth(request(app).get(`/repos/${repoId}/dependencies?outdated=yes`))).status,
    ).toBe(400);
    expect(
      (await auth(request(app).get(`/repos/${repoId}/dependencies?page=0`))).status,
    ).toBe(400);
  });

  it('returns an overview with health and cards', async () => {
    const res = await auth(request(app).get(`/repos/${repoId}/overview`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      available: true,
      scanId,
      cards: {
        activity: { last90Commits: 4 },
        dependencies: { total: 2, outdated: 1, advisoryCount: 1 },
      },
    });
    expect(res.body.health.components).toHaveLength(5);
    expect(res.body.health.score).toBeGreaterThan(0);
    expect(res.body.cards.ci.worstWorkflow).toBe('CI');
  });

  it('returns unavailable shapes when no scan exists', async () => {
    const emptyRepo = await insertRepository({
      githubId: 3000,
      owner: 'test',
      name: 'empty',
      addedBy: userId,
    });
    const structure = await auth(
      request(app).get(`/repos/${emptyRepo}/structure`),
    );
    expect(structure.status).toBe(200);
    expect(structure.body).toMatchObject({
      available: false,
      scanId: null,
      reason: 'no_scan',
    });

    const dependencies = await auth(
      request(app).get(`/repos/${emptyRepo}/dependencies`),
    );
    expect(dependencies.status).toBe(200);
    expect(dependencies.body).toMatchObject({
      available: false,
      rows: [],
      pagination: { total: 0, hasMore: false },
    });
  });

  it('validates repository ids and 404s unknown repositories', async () => {
    expect(
      (await auth(request(app).get('/repos/not-a-uuid/structure'))).status,
    ).toBe(400);
    const missing = await auth(
      request(app).get('/repos/00000000-0000-4000-8000-000000000000/structure'),
    );
    expect(missing.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`/repos/${repoId}/overview`);
    expect(res.status).toBe(401);
  });

  it('queues a dependency refresh', async () => {
    const res = await auth(
      request(app).post(`/repos/${repoId}/dependencies/refresh`),
    );
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ queued: true, scanId });
    const job = await scanQueue.getJob(`deps-refresh-${scanId}`);
    expect(job).toBeDefined();
    await job?.remove();
  });

  it('rejects refresh when the latest scan has no dependencies', async () => {
    const emptyRepo = await insertRepository({
      githubId: 3001,
      owner: 'test',
      name: 'no-deps',
      addedBy: userId,
    });
    await pool.query(
      `INSERT INTO scans (repo_id, status, completed_at, summary, repo_tree)
       VALUES ($1, 'complete', NOW(), $2, $3)`,
      [
        emptyRepo,
        JSON.stringify({ ...summary, dependencyHealth: null }),
        JSON.stringify(repoTree),
      ],
    );
    const res = await auth(
      request(app).post(`/repos/${emptyRepo}/dependencies/refresh`),
    );
    expect(res.status).toBe(409);
  });

  it('refreshes dependency versions and advisories in the worker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('registry.npmjs.org/alpha/latest')) {
          return new Response(JSON.stringify({ version: '2.0.0' }), { status: 200 });
        }
        if (url.includes('pypi.org/pypi/beta/json')) {
          return new Response(JSON.stringify({ info: { version: '3.0.0' } }), {
            status: 200,
          });
        }
        if (url.includes('api.osv.dev/v1/querybatch')) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  vulns: [
                    { id: 'OSV-REFRESH', database_specific: { severity: 'critical' } },
                  ],
                },
                {},
              ],
            }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await processDependencyRefreshJob({ data: { scanId, repoId } });

    const rows = await pool.query<{
      package_name: string;
      latest_version: string;
      outdated: boolean;
      advisory_count: number;
      max_severity: string | null;
    }>(
      `SELECT package_name, latest_version, outdated, advisory_count, max_severity
       FROM scan_dependencies WHERE scan_id = $1 ORDER BY package_name`,
      [scanId],
    );
    expect(rows.rows[0]).toMatchObject({
      package_name: 'alpha',
      latest_version: '2.0.0',
      outdated: true,
      advisory_count: 1,
      max_severity: 'critical',
    });
    expect(rows.rows[1]).toMatchObject({
      package_name: 'beta',
      latest_version: '3.0.0',
      outdated: false,
    });

    const stored = await pool.query<{ summary: ScanSummary }>(
      'SELECT summary FROM scans WHERE id = $1',
      [scanId],
    );
    expect(stored.rows[0]!.summary.dependencyHealth).toMatchObject({
      total: 2,
      checked: 2,
      outdated: 1,
      advisoryCount: 1,
    });
  });
});
