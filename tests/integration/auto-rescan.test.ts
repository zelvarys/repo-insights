import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { Worker } from 'bullmq';
import { createApp } from '../../server/app.js';
import { pool, closeDb } from '../../server/config/database.js';
import { closeRedis, createRedisConnection } from '../../server/config/redis.js';
import { truncateAll, insertUser, insertRepository } from '../helpers/db.js';
import { signJwt, parseExpiresIn } from '../../server/utils/jwt.js';
import { env } from '../../server/config/env.js';
import { encryptToken } from '../../server/utils/crypto.js';
import {
  SCAN_QUEUE_NAME,
  scanQueue,
  type ScanQueueJobData,
} from '../../server/modules/scans/scan.queue.js';
import {
  REPO_RESCAN_INTERVAL_MS,
  removeRepoRescanScheduler,
  repoRescanSchedulerId,
  upsertRepoRescanScheduler,
} from '../../server/modules/scans/scan.scheduler.js';
import { processScheduledScanJob } from '../../server/modules/scans/scan.worker.js';

let app: Express;
const schedulerRepos = new Set<string>();

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRepositoryFetch(): void {
  const repo = {
    id: 900,
    name: 'auto-rescan',
    full_name: 'test/auto-rescan',
    owner: { login: 'test' },
    private: false,
    default_branch: 'main',
    stargazers_count: 1,
    forks_count: 0,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.includes('/graphql')) {
        const body = JSON.parse(String(init?.body)) as { query: string };
        if (body.query.includes('MergedPullRequests')) {
          return json({
            data: {
              search: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [],
              },
            },
          });
        }
        return json({
          data: {
            user: {
              contributionsCollection: {
                commitContributionsByRepository: [],
              },
            },
          },
        });
      }

      if (url.includes('/user/repos?')) return json([repo]);
      if (url.endsWith('/repos/test/auto-rescan')) return json(repo);
      if (url.includes('/repos/test/auto-rescan/contributors?')) {
        return json([
          { login: 'alice', id: 1, contributions: 3, avatar_url: '' },
          { login: 'bob', id: 2, contributions: 1, avatar_url: '' },
        ]);
      }

      throw new Error(`Unexpected GitHub request: ${url}`);
    }),
  );
}

async function schedulerKeys(): Promise<string[]> {
  const schedulers = await scanQueue.getJobSchedulers();
  return schedulers.map((scheduler) => scheduler.key);
}

async function repeatJobs(repoId: string) {
  const schedulerId = repoRescanSchedulerId(repoId);
  const jobs = await scanQueue.getJobs(
    ['waiting', 'active', 'delayed', 'prioritized', 'completed', 'failed'],
    0,
    1000,
  );
  return jobs.filter((job) => job.repeatJobKey === schedulerId);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  vi.unstubAllGlobals();
});

afterEach(async () => {
  for (const repoId of schedulerRepos) {
    await removeRepoRescanScheduler(repoId).catch(() => false);
    for (const job of await repeatJobs(repoId)) {
      await job.remove().catch(() => undefined);
    }
  }
  schedulerRepos.clear();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await truncateAll();
  await closeDb();
  await closeRedis();
  await scanQueue.close();
});

describe('automatic rescans', () => {
  it('creates a six-hour repo-scoped scheduler when a repository is added', async () => {
    const userId = await insertUser({
      githubId: 500,
      username: 'test',
      accessTokenCiphertext: encryptToken('gho_test_token'),
    });
    const token = signJwt(userId, parseExpiresIn(env.JWT_EXPIRES_IN));
    stubRepositoryFetch();

    const res = await request(app)
      .post('/repos')
      .set('Cookie', `token=${token}`)
      .send({ githubId: 900 });

    expect(res.status).toBe(201);
    const repoId = res.body.repository.id as string;
    schedulerRepos.add(repoId);

    const schedulers = await scanQueue.getJobSchedulers();
    const scheduler = schedulers.find(
      (entry) => entry.key === repoRescanSchedulerId(repoId),
    );
    expect(scheduler).toBeDefined();
    expect(scheduler?.every).toBe(REPO_RESCAN_INTERVAL_MS);
    expect(scheduler?.name).toBe('scheduled-scan');
    expect(scheduler?.template?.data).toEqual({ repoId });
  });

  it('removes the scheduler when a repository is deleted', async () => {
    const userId = await insertUser({ githubId: 501, username: 'deleter' });
    const repoId = await insertRepository({
      githubId: 901,
      owner: 'test',
      name: 'delete-scheduler',
      addedBy: userId,
    });
    const token = signJwt(userId, parseExpiresIn(env.JWT_EXPIRES_IN));
    schedulerRepos.add(repoId);

    await upsertRepoRescanScheduler(repoId);
    expect(await schedulerKeys()).toContain(repoRescanSchedulerId(repoId));

    const res = await request(app)
      .delete(`/repos/${repoId}`)
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(204);
    expect(await schedulerKeys()).not.toContain(repoRescanSchedulerId(repoId));
  });

  it('does not enqueue another scan while one is pending', async () => {
    const userId = await insertUser({ githubId: 502, username: 'owner' });
    const repoId = await insertRepository({
      githubId: 902,
      owner: 'test',
      name: 'pending-scan',
      addedBy: userId,
    });
    const pending = await pool.query<{ id: string }>(
      `INSERT INTO scans (repo_id, status) VALUES ($1, 'pending') RETURNING id`,
      [repoId],
    );

    const before = await scanQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );
    await processScheduledScanJob({ data: { repoId } });
    const after = await scanQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );

    expect(after).toEqual(before);
    const scans = await pool.query<{ id: string }>(
      'SELECT id FROM scans WHERE repo_id = $1',
      [repoId],
    );
    expect(scans.rows).toEqual([{ id: pending.rows[0]!.id }]);
  });

  it('does not accumulate missed runs while the worker is offline', async () => {
    const userId = await insertUser({ githubId: 503, username: 'offline' });
    const repoId = await insertRepository({
      githubId: 903,
      owner: 'test',
      name: 'offline-worker',
      addedBy: userId,
    });
    schedulerRepos.add(repoId);
    const schedulerId = repoRescanSchedulerId(repoId);

    await upsertRepoRescanScheduler(repoId, 100);
    await wait(650);

    const offlineJobs = await repeatJobs(repoId);
    expect(offlineJobs).toHaveLength(1);
    expect(['delayed', 'waiting']).toContain(
      await offlineJobs[0]!.getState(),
    );

    let processed = 0;
    let resolveFirst!: () => void;
    const firstProcessed = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const worker = new Worker<ScanQueueJobData>(
      SCAN_QUEUE_NAME,
      async (job) => {
        if (job.repeatJobKey !== schedulerId) return;
        processed += 1;
        if (processed === 1) resolveFirst();
      },
      { connection: createRedisConnection(), concurrency: 1 },
    );

    try {
      await worker.waitUntilReady();
      await firstProcessed;
    } finally {
      await worker.close();
    }

    await wait(150);

    expect(processed).toBeGreaterThanOrEqual(1);
    expect(processed).toBeLessThan(4);

    const pendingJobs = await scanQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'prioritized',
    ]);
    expect(
      pendingJobs.filter((job) => job.repeatJobKey === schedulerId),
    ).toHaveLength(1);
  });
});
