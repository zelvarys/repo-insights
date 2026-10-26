import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { redis } from '../../server/config/redis.js';
import { rateLimit } from '../../server/middleware/rate-limit.middleware.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rateLimit', () => {
  it('keys authenticated requests by user id, not IP', async () => {
    const incr = vi.spyOn(redis, 'incr').mockResolvedValue(1);
    vi.spyOn(redis, 'expire').mockResolvedValue(1);

    const req = {
      userId: 'user-123',
      ip: '203.0.113.5',
    } as unknown as Request;
    const res = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn();

    const middleware = rateLimit({
      name: 'test-user-key',
      windowSeconds: 60,
      max: 10,
    });
    await middleware(req, res, next);

    const key = incr.mock.calls[0]![0];
    expect(key).toContain('user-123');
    expect(key).not.toContain('203.0.113.5');
    expect(next).toHaveBeenCalledWith();
  });
});
