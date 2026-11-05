import { Redis } from 'ioredis';

const HEARTBEAT_KEY = 'worker:heartbeat:scan';
const MAX_AGE_MS = 90_000;

if (!process.env.REDIS_URL) {
  console.error('REDIS_URL is required');
  process.exit(1);
}

const redis = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

let exitCode = 1;

try {
  await redis.connect();
  const value = await redis.get(HEARTBEAT_KEY);
  const timestamp = Number(value);
  if (
    Number.isFinite(timestamp) &&
    Date.now() - timestamp <= MAX_AGE_MS
  ) {
    exitCode = 0;
  } else {
    console.error('Scan worker heartbeat is missing or stale');
  }
} catch (err) {
  console.error(
    `Scan worker healthcheck failed: ${err instanceof Error ? err.message : String(err)}`,
  );
} finally {
  await redis.quit().catch(() => {});
}

process.exit(exitCode);
