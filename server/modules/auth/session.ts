import { redis } from '../../config/redis.js';

const REVOKED_PREFIX = 'revoked:';

export async function revokeSession(
  jti: string,
  expiresAtSeconds: number,
): Promise<void> {
  const ttl = expiresAtSeconds - Math.floor(Date.now() / 1000);
  if (ttl <= 0) return;
  await redis.set(`${REVOKED_PREFIX}${jti}`, '1', 'EX', ttl);
}

export async function isSessionRevoked(jti: string): Promise<boolean> {
  return (await redis.exists(`${REVOKED_PREFIX}${jti}`)) === 1;
}
