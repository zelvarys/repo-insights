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
  structure: (repoId: string, scanId: string) =>
    `cache:structure:${repoId}:${scanId}`,
  activity: (repoId: string, scanId: string, range: number) =>
    `cache:activity:${repoId}:${scanId}:${range}`,
  concentration: (repoId: string, scanId: string) =>
    `cache:concentration:${repoId}:${scanId}`,
  ci: (repoId: string, scanId: string, filters: string) =>
    `cache:ci:${repoId}:${scanId}:${filters}`,
  dependencies: (repoId: string, scanId: string, filters: string) =>
    `cache:dependencies:${repoId}:${scanId}:${filters}`,
  dependenciesPattern: (repoId: string, scanId: string) =>
    `cache:dependencies:${repoId}:${scanId}:*`,
  dependencySummary: (repoId: string, scanId: string) =>
    `cache:dependency-summary:${repoId}:${scanId}`,
  overview: (repoId: string, scanId: string) =>
    `cache:overview:${repoId}:${scanId}`,
  dependencyRegistry: (ecosystem: string, name: string) =>
    `cache:deps:registry:${ecosystem}:${name}`,
  dependencyOsv: (ecosystem: string, name: string, version: string) =>
    `cache:deps:osv:${ecosystem}:${name}@${version}`,
  insightPattern: (repoId: string) => `cache:*:${repoId}:*`,
} as const;