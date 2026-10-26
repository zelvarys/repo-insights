import { redis } from '../config/redis.js';

/**
 * Cache a JSON value under a key with a TTL.
 * Values are stringified once; reads JSON.parse it back.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt entry — evict and move on
    await redis.del(key);
    return null;
  }
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(...keys);
}

/** Namespaced keys so different features can't collide. */
export const cacheKeys = {
  scanResult: (repoId: string) => `cache:scan-result:${repoId}`,
  metrics: (repoId: string, scanId: string) =>
    `cache:metrics:${repoId}:${scanId}`,
  metricsPattern: (repoId: string) => `cache:metrics:${repoId}:*`,
} as const;