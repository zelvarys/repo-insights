import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../server/app.js';
import { closeDb } from '../../server/config/database.js';
import { closeRedis } from '../../server/config/redis.js';

let app: Express;

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await closeDb();
  await closeRedis();
  const { scanQueue } = await import('../../server/modules/scans/scan.queue.js');
  await scanQueue.close();
});

describe('health endpoints', () => {
  it('GET /health reports liveness', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /ready reports database and Redis readiness', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });
});
