import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../server/app.js';
import { pool, closeDb } from '../../server/config/database.js';
import { closeRedis } from '../../server/config/redis.js';
import { truncateAll, insertUser, insertRepository } from '../helpers/db.js';
import { signJwt, parseExpiresIn } from '../../server/utils/jwt.js';
import { env } from '../../server/config/env.js';
import { encryptToken } from '../../server/utils/crypto.js';
import { processScanJobForTests } from '../../server/modules/scans/scan.worker.js';
import {
  cacheCompletedScan,
  requestScan,
} from '../../server/modules/scans/scan.service.js';
import { scanQueue } from '../../server/modules/scans/scan.queue.js';
import { cacheSet, cacheGet, cacheDel, cacheKeys } from '../../server/utils/cache.js';
import type { ScanSummary } from '../../shared/types.js';
import { deleteScanContext } from '../../server/modules/scans/scan.context.js';

let app: Express;
let token: string;
let userId: string;
let repoId: string;

/**
 * Minimal GitHub API stub. Returns plausible shapes for each endpoint
 * the worker hits. Any unexpected request throws so the test fails
 * loudly rather than silently falling back to real GitHub.
 */
function stubGithubFetch(options: {
  contributors?: Array<{ login: string; contributions: number }>;
  commits?: Array<{ sha: string; authorLogin: string | null; message: string }>;
  commitFilesBySha?: Record<string, string[]>;
  rootFiles?: string[];
  fileContents?: Record<string, string>;
  workflows?: string[];
}): void {
  const contributors = options.contributors ?? [];
  const commits = options.commits ?? [];
  const filesBySha = options.commitFilesBySha ?? {};
  const rootFiles = options.rootFiles ?? [];
  const fileContents = options.fileContents ?? {};
  const workflows = options.workflows ?? [];

  const originalFetch = globalThis.fetch;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();

      // /user/repos (not used in scan, but a safety net)
      if (url.includes('/user/repos')) {
        return jsonResponse([]);
      }

      // Contributors
      if (/\/repos\/[^/]+\/[^/]+\/contributors/.test(url)) {
        return jsonResponse(
          contributors.map((c) => ({
            login: c.login,
            id: 1,
            contributions: c.contributions,
            avatar_url: '',
          })),
        );
      }

      // Commits list
      if (/\/repos\/[^/]+\/[^/]+\/commits\?/.test(url)) {
        return jsonResponse(
          commits.map((c) => ({
            sha: c.sha,
            commit: {
              message: c.message,
              author: {
                name: 'Test',
                email: 't@t',
                date: '2026-01-01T00:00:00Z',
              },
            },
            author: c.authorLogin ? { login: c.authorLogin } : null,
          })),
        );
      }

      // Commit detail
      const detailMatch = /\/repos\/[^/]+\/[^/]+\/commits\/([^?]+)$/.exec(url);
      if (detailMatch) {
        const sha = detailMatch[1]!;
        const files = filesBySha[sha] ?? [];
        return jsonResponse({
          sha,
          files: files.map((filename) => ({
            filename,
            status: 'modified',
            additions: 1,
            deletions: 0,
            changes: 1,
          })),
        });
      }

      // Workflows listing
      if (/\/contents\/\.github%2Fworkflows\?/.test(url)) {
        return jsonResponse(
          workflows.map((name) => ({
            type: 'file',
            name,
            path: `.github/workflows/${name}`,
            sha: 'sha',
          })),
        );
      }

      // Root listing
      if (/\/contents\/\?ref=/.test(url)) {
        return jsonResponse(
          rootFiles.map((name) => ({
            type: 'file',
            name,
            path: name,
            sha: 'sha',
          })),
        );
      }

      // File contents
      const fileMatch = /\/contents\/([^?]+)\?ref=/.exec(url);
      if (fileMatch) {
        const path = decodeURIComponent(fileMatch[1]!);
        const content = fileContents[path];
        if (content === undefined) {
          return notFound();
        }
        return jsonResponse({
          type: 'file',
          content: Buffer.from(content, 'utf8').toString('base64'),
          encoding: 'base64',
        });
      }

      // GraphQL
      if (url.includes('/graphql')) {
        return jsonResponse({ data: { user: null } });
      }

      originalFetch(input);
      throw new Error(`Unexpected fetch in test: ${url}`);
    }),
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notFound(): Response {
  return new Response('{"message":"Not Found"}', { status: 404 });
}

beforeAll(async () => {
  app = createApp();
  token = '';
});

beforeEach(async () => {
  await truncateAll();
  vi.unstubAllGlobals();

  userId = await insertUser({
    githubId: 100,
    username: 'tester',
    accessTokenCiphertext: encryptToken('gho_test_token'),
  });
  repoId = await insertRepository({
    githubId: 200,
    owner: 'test',
    name: 'repo',
    addedBy: userId,
    contributorCount: 2,
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

describe('scan pipeline', () => {
  it('creates a scan row, processes it, writes tool_usage, and exposes metrics', async () => {
    stubGithubFetch({
      contributors: [
        { login: 'alice', contributions: 10 },
        { login: 'bob', contributions: 5 },
      ],
      commits: [
        { sha: 'sha1', authorLogin: 'alice', message: 'feat' },
        { sha: 'sha2', authorLogin: 'bob', message: 'chore' },
      ],
      commitFilesBySha: {
        sha1: ['src/foo.test.ts'],
        sha2: ['src/bar.ts'],
      },
      rootFiles: ['package.json', 'jest.config.js'],
      fileContents: {
        'package.json': JSON.stringify({ devDependencies: { jest: '29' } }),
        'jest.config.js': 'module.exports = {};',
      },
      workflows: ['ci.yml'],
    });

    // POST scan (mounted)
    const post = await request(app)
      .post(`/repos/${repoId}/scan`)
      .set('Cookie', `token=${token}`);
    expect([200, 202]).toContain(post.status);
    const scanId: string = post.body.scan.id;

    // Run the worker synchronously (bypass BullMQ for determinism)
    await processScanJobForTests({
      data: { scanId, repoId, requestedBy: userId },
    } as any);

    // Scan row complete
    const scanRow = await pool.query<{
      status: string;
      summary: Record<string, unknown>;
      languages: string[] | null;
    }>(
      'SELECT status, summary, languages FROM scans WHERE id = $1',
      [scanId],
    );
    expect(scanRow.rows[0]?.status).toBe('complete');
    expect(scanRow.rows[0]?.languages).toEqual(['js']);

    // Simulate the Redis context expiring before metrics are read.
    await deleteScanContext(scanId);

    // tool_usage populated
    const toolUsage = await pool.query<{ tool_name: string }>(
      `SELECT tool_name FROM tool_usage
       WHERE scan_id = $1 AND contributor_login IS NULL`,
      [scanId],
    );
    const names = toolUsage.rows.map((r) => r.tool_name);
    expect(names).toContain('jest');

    // tracked_tools backfilled
    const tracked = await pool.query<{ tool_name: string; enabled: boolean }>(
      'SELECT tool_name, enabled FROM tracked_tools WHERE repo_id = $1',
      [repoId],
    );
    const jestTracked = tracked.rows.find((r) => r.tool_name === 'jest');
    expect(jestTracked?.enabled).toBe(true);

    // Metrics endpoint returns a score
    const metrics = await request(app)
      .get(`/repos/${repoId}/metrics`)
      .set('Cookie', `token=${token}`);
    expect(metrics.status).toBe(200);
    expect(metrics.body.scanId).toBe(scanId);
    expect(metrics.body.toolsTracked).toBeGreaterThan(0);
    expect(metrics.body.languages).toContain('js');

    const summary = scanRow.rows[0]!.summary;
    expect(summary.adoptionScore).toBe(metrics.body.adoptionScore);
    expect(summary.coverage).toBe(metrics.body.coverage);
    expect(summary.adoption).toBe(metrics.body.adoption);
    expect(summary.toolsChecked).toBe(metrics.body.toolsChecked);
    expect(summary.toolsTracked).toBe(metrics.body.toolsTracked);
    expect(summary.toolsDetected).toBe(metrics.body.toolsDetected);

    const trackedTools = await request(app)
      .get(`/repos/${repoId}/tracked-tools`)
      .set('Cookie', `token=${token}`);
    expect(trackedTools.status).toBe(200);
    const jestTool = trackedTools.body.tools.find(
      (t: { toolName: string }) => t.toolName === 'jest',
    );
    expect(jestTool?.relevant).toBe(true);
    const pytestTool = trackedTools.body.tools.find(
      (t: { toolName: string }) => t.toolName === 'pytest',
    );
    expect(pytestTool?.relevant).toBe(false);
  });

  it('fails a stale pending scan and starts a new one', async () => {
    const stale = await pool.query<{ id: string }>(
      `INSERT INTO scans (repo_id, status, created_at)
       VALUES ($1, 'pending', NOW() - INTERVAL '11 minutes')
       RETURNING id`,
      [repoId],
    );
    const staleId = stale.rows[0]!.id;

    const post = await request(app)
      .post(`/repos/${repoId}/scan`)
      .set('Cookie', `token=${token}`);

    expect(post.status).toBe(202);
    expect(post.body.cached).toBe(false);
    expect(post.body.scan.id).not.toBe(staleId);

    const rows = await pool.query<{
      id: string;
      status: string;
      error: string | null;
    }>('SELECT id, status, error FROM scans WHERE repo_id = $1', [repoId]);
    const staleRow = rows.rows.find((r) => r.id === staleId);
    expect(staleRow?.status).toBe('failed');
    expect(staleRow?.error).toBe('Scan timed out before starting');
    expect(
      rows.rows.find((r) => r.id === post.body.scan.id)?.status,
    ).toBe('pending');
  });

  it('does not let an older retry overwrite a newer cached scan', async () => {
    const key = cacheKeys.scanResult(repoId);
    const newer: ScanSummary = {
      id: '22222222-2222-2222-2222-222222222222',
      repoId,
      status: 'complete',
      startedAt: null,
      completedAt: null,
      error: null,
      summary: null,
      createdAt: '2026-01-01T01:00:00.000Z',
    };
    const older: ScanSummary = {
      ...newer,
      id: '11111111-1111-1111-1111-111111111111',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    await cacheSet(key, { scan: newer, writtenAt: Date.now() }, 60);
    await cacheCompletedScan(older);

    const cached = await cacheGet<{ scan: ScanSummary }>(key);
    expect(cached?.scan.id).toBe(newer.id);
    await cacheDel(key);
  });

  it('creates only one scan and one job for concurrent requests', async () => {
    const countsBefore = await scanQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );
    const totalBefore = Object.values(countsBefore).reduce((a, b) => a + b, 0);

    const [first, second] = await Promise.all([
      requestScan(repoId, userId),
      requestScan(repoId, userId),
    ]);

    expect(first.scan.id).toBe(second.scan.id);
    expect([first.cached, second.cached].filter(Boolean)).toHaveLength(1);

    const countsAfter = await scanQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );
    const totalAfter = Object.values(countsAfter).reduce((a, b) => a + b, 0);
    expect(totalAfter - totalBefore).toBe(1);

    const rows = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM scans WHERE repo_id = $1',
      [repoId],
    );
    expect(rows.rows[0]?.count).toBe('1');
  });

  it('second POST within an hour returns cached scan (200, not 202)', async () => {
    stubGithubFetch({
      contributors: [{ login: 'alice', contributions: 1 }],
      commits: [{ sha: 's1', authorLogin: 'alice', message: 'x' }],
      commitFilesBySha: { s1: ['src/a.test.ts'] },
      rootFiles: ['package.json', 'jest.config.js'],
      fileContents: {
        'package.json': JSON.stringify({ devDependencies: { jest: '29' } }),
        'jest.config.js': '',
      },
      workflows: [],
    });

    const first = await request(app)
      .post(`/repos/${repoId}/scan`)
      .set('Cookie', `token=${token}`);
    expect([200, 202]).toContain(first.status);

    await processScanJobForTests({
      data: {
        scanId: first.body.scan.id,
        repoId,
        requestedBy: userId,
      },
    } as any);

    const second = await request(app)
      .post(`/repos/${repoId}/scan`)
      .set('Cookie', `token=${token}`);
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.scan.id).toBe(first.body.scan.id);
  });

  it('scan with broken token fails and invalidates cache', async () => {
    stubGithubFetch({});

    // Corrupt the token
    await pool.query(
      `UPDATE users SET access_token = 'not-ciphertext' WHERE id = $1`,
      [userId],
    );

    const post = await request(app)
      .post(`/repos/${repoId}/scan`)
      .set('Cookie', `token=${token}`);
    const scanId: string = post.body.scan.id;

    await expect(
      processScanJobForTests({
        data: { scanId, repoId, requestedBy: userId },
      } as any),
    ).rejects.toThrow();

    const row = await pool.query<{ status: string; error: string | null }>(
      'SELECT status, error FROM scans WHERE id = $1',
      [scanId],
    );
    expect(row.rows[0]?.status).toBe('failed');
    expect(row.rows[0]?.error).toContain('No GitHub token available');
  });
});