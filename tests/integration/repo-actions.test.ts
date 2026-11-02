import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../server/app.js';
import { closeDb } from '../../server/config/database.js';
import { closeRedis } from '../../server/config/redis.js';
import { env } from '../../server/config/env.js';
import { encryptToken } from '../../server/utils/crypto.js';
import { signJwt, parseExpiresIn } from '../../server/utils/jwt.js';
import { insertRepository, insertUser, truncateAll } from '../helpers/db.js';

let app: Express;
let token: string;
let userId: string;
let repoId: string;

function auth(req: request.Test): request.Test {
  return req.set('Cookie', `token=${token}`);
}

function header(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  vi.unstubAllGlobals();
  userId = await insertUser({
    githubId: 5000,
    username: 'action-tester',
    accessTokenCiphertext: encryptToken('gho_write_token'),
  });
  repoId = await insertRepository({
    githubId: 6000,
    owner: 'test',
    name: 'write-actions',
    addedBy: userId,
  });
  token = signJwt(userId, parseExpiresIn(env.JWT_EXPIRES_IN));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await truncateAll();
  await closeDb();
  await closeRedis();
  const { scanQueue } = await import('../../server/modules/scans/scan.queue.js');
  await scanQueue.close();
});

describe('GitHub write action endpoints', () => {
  it('queues a failed workflow run re-run', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://api.github.com/repos/test/write-actions/actions/runs/123/rerun',
      );
      expect(init?.method).toBe('POST');
      expect(header(init, 'Authorization')).toBe('Bearer gho_write_token');
      expect(header(init, 'Accept')).toBe('application/vnd.github+json');
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await auth(request(app).post(`/repos/${repoId}/ci/runs/123/rerun`));

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ runId: 123, queued: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid workflow run ids before calling GitHub', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await auth(request(app).post(`/repos/${repoId}/ci/runs/not-a-number/rerun`));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates an issue with a trimmed title', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.github.com/repos/test/write-actions/issues');
      expect(init?.method).toBe('POST');
      expect(header(init, 'Authorization')).toBe('Bearer gho_write_token');
      expect(JSON.parse(String(init?.body))).toEqual({
        title: 'Fix dependency health',
        body: '## Finding\n2 packages are outdated.',
      });
      return jsonResponse(
        {
          number: 42,
          html_url: 'https://github.com/test/write-actions/issues/42',
          title: 'Fix dependency health',
        },
        201,
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await auth(request(app).post(`/repos/${repoId}/issues`)).send({
      title: '  Fix dependency health  ',
      body: '## Finding\n2 packages are outdated.',
    });

    expect(res.status).toBe(201);
    expect(res.body.issue).toEqual({
      number: 42,
      url: 'https://github.com/test/write-actions/issues/42',
      title: 'Fix dependency health',
    });
  });

  it('validates issue input', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const missingTitle = await auth(request(app).post(`/repos/${repoId}/issues`)).send({
      body: 'No title',
    });
    expect(missingTitle.status).toBe(400);

    const emptyTitle = await auth(request(app).post(`/repos/${repoId}/issues`)).send({
      title: '   ',
    });
    expect(emptyTitle.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a Codespace for the requested ref', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.github.com/repos/test/write-actions/codespaces');
      expect(init?.method).toBe('POST');
      expect(header(init, 'Authorization')).toBe('Bearer gho_write_token');
      expect(JSON.parse(String(init?.body))).toEqual({ ref: 'release' });
      return jsonResponse(
        {
          name: 'fluffy-space',
          web_url: 'https://fluffy-space.github.dev',
          state: 'Available',
        },
        201,
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await auth(request(app).post(`/repos/${repoId}/codespaces`)).send({
      ref: 'release',
    });

    expect(res.status).toBe(201);
    expect(res.body.codespace).toEqual({
      name: 'fluffy-space',
      webUrl: 'https://fluffy-space.github.dev',
      state: 'Available',
    });
  });

  it('uses the repository default branch when no ref is provided', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ ref: 'main' });
      return jsonResponse(
        {
          name: 'default-space',
          web_url: 'https://default-space.github.dev',
          state: 'Available',
        },
        201,
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await auth(request(app).post(`/repos/${repoId}/codespaces`)).send({});

    expect(res.status).toBe(201);
  });

  it('maps missing GitHub scopes to a forbidden response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'Resource not accessible' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const res = await auth(request(app).post(`/repos/${repoId}/ci/runs/123/rerun`));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('required scopes');
  });

  it('returns 404 for an unknown repository', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await auth(
      request(app).post('/repos/00000000-0000-0000-0000-000000000000/issues'),
    ).send({ title: 'Test' });

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
