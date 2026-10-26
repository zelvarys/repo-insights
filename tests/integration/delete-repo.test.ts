import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../server/app.js';
import { pool, closeDb } from '../../server/config/database.js';
import { closeRedis } from '../../server/config/redis.js';
import { truncateAll, insertUser, insertRepository } from '../helpers/db.js';
import { signJwt, parseExpiresIn } from '../../server/utils/jwt.js';
import { env } from '../../server/config/env.js';
import { cacheSet, cacheGet, cacheKeys } from '../../server/utils/cache.js';
import { processScanJobForTests } from '../../server/modules/scans/scan.worker.js';

let app: Express;
let userId: string;
let repoId: string;
let token: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  userId = await insertUser({ githubId: 300, username: 'deleter' });
  repoId = await insertRepository({
    githubId: 400,
    owner: 'test',
    name: 'to-delete',
    addedBy: userId,
  });
  token = signJwt(userId, parseExpiresIn(env.JWT_EXPIRES_IN));
});

afterAll(async () => {
  await truncateAll();
  await closeDb();
  await closeRedis();
  const { scanQueue } = await import('../../server/modules/scans/scan.queue.js');
  await scanQueue.close();
});

async function insertScan(status: 'pending' | 'running' | 'complete'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (repo_id, status) VALUES ($1, $2) RETURNING id`,
    [repoId, status],
  );
  return rows[0]!.id;
}

describe('DELETE /repos/:id', () => {
  it('removes the repo, its scans, tracked tools, and cache entries', async () => {
    const scanId = await insertScan('complete');
    await insertScan('pending');
    await pool.query(
      `INSERT INTO tool_usage (scan_id, repo_id, tool_name, category, detected)
       VALUES ($1, $2, 'eslint', 'linting', TRUE)`,
      [scanId, repoId],
    );
    await pool.query(
      `INSERT INTO tracked_tools (repo_id, tool_name) VALUES ($1, 'eslint')`,
      [repoId],
    );
    await cacheSet(cacheKeys.scanResult(repoId), { scanId }, 60);
    await cacheSet(cacheKeys.metrics(repoId, scanId), { scanId }, 60);

    const otherId = await insertRepository({
      githubId: 401,
      owner: 'test',
      name: 'keep',
      addedBy: userId,
    });
    await cacheSet(cacheKeys.metrics(otherId, 'other-scan'), { keep: true }, 60);

    const res = await request(app)
      .delete(`/repos/${repoId}`)
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await cacheGet(cacheKeys.scanResult(repoId))).toBeNull();
    expect(await cacheGet(cacheKeys.metrics(repoId, scanId))).toBeNull();
    expect(await cacheGet(cacheKeys.metrics(otherId, 'other-scan'))).toEqual({
      keep: true,
    });

    const counts = await pool.query<{
      repos: number;
      scans: number;
      usage: number;
      tools: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM repositories WHERE id = $1) AS repos,
         (SELECT COUNT(*)::int FROM scans WHERE repo_id = $1) AS scans,
         (SELECT COUNT(*)::int FROM tool_usage WHERE repo_id = $1) AS usage,
         (SELECT COUNT(*)::int FROM tracked_tools WHERE repo_id = $1) AS tools`,
      [repoId],
    );
    expect(counts.rows[0]).toEqual({ repos: 0, scans: 0, usage: 0, tools: 0 });

    const get = await request(app)
      .get(`/repos/${repoId}`)
      .set('Cookie', `token=${token}`);
    expect(get.status).toBe(404);

    const list = await request(app)
      .get('/repos')
      .set('Cookie', `token=${token}`);
    expect(list.body.repositories.map((r: { id: string }) => r.id)).not.toContain(
      repoId,
    );
  });

  it('rejects invalid ids and unknown repositories', async () => {
    const invalid = await request(app)
      .delete('/repos/not-a-uuid')
      .set('Cookie', `token=${token}`);
    expect(invalid.status).toBe(400);

    const missing = await request(app)
      .delete('/repos/00000000-0000-0000-0000-000000000000')
      .set('Cookie', `token=${token}`);
    expect(missing.status).toBe(404);
  });

  it('does not fail worker jobs whose repository has been removed', async () => {
    const scanId = await insertScan('pending');

    await request(app)
      .delete(`/repos/${repoId}`)
      .set('Cookie', `token=${token}`)
      .expect(204);

    await expect(
      processScanJobForTests({
        data: { scanId, repoId, requestedBy: userId },
      } as never),
    ).resolves.toBeUndefined();

    const { rows } = await pool.query('SELECT id FROM scans WHERE id = $1', [
      scanId,
    ]);
    expect(rows).toHaveLength(0);
  });
});
