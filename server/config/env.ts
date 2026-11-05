import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.error(`❌ Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

const NODE_ENVS = ['development', 'production', 'test'] as const;
type NodeEnv = (typeof NODE_ENVS)[number];

const nodeEnv = optional('NODE_ENV', 'development');
if (!NODE_ENVS.includes(nodeEnv as NodeEnv)) {
  console.error(
    `❌ Invalid NODE_ENV: ${nodeEnv}. Expected one of: ${NODE_ENVS.join(', ')}`,
  );
  process.exit(1);
}

export type TrustProxySetting = boolean | number | string;

export function resolveTrustProxy(
  value: string,
  production: boolean,
): TrustProxySetting {
  const normalized = value.trim();
  if (!normalized) return production ? 1 : false;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(optional('PORT', '3000')),
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:5173'),

  // Phase 1
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: required('REDIS_URL'),

  // Phase 2
  GITHUB_CLIENT_ID: required('GITHUB_CLIENT_ID'),
  GITHUB_CLIENT_SECRET: required('GITHUB_CLIENT_SECRET'),
  GITHUB_CALLBACK_URL: required('GITHUB_CALLBACK_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),
  TOKEN_ENCRYPTION_KEY: required('TOKEN_ENCRYPTION_KEY'),
  GITHUB_FETCH_TIMEOUT_MS: Number(optional('GITHUB_FETCH_TIMEOUT_MS', '15000')),
  TRUST_PROXY: optional('TRUST_PROXY', ''),
  SCAN_RETENTION_DAYS: Number(optional('SCAN_RETENTION_DAYS', '90')),
} as const;

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

if (!Number.isFinite(env.PORT) || env.PORT <= 0) {
  console.error(`❌ Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}

if (
  !Number.isFinite(env.GITHUB_FETCH_TIMEOUT_MS) ||
  env.GITHUB_FETCH_TIMEOUT_MS <= 0
) {
  console.error(
    `❌ Invalid GITHUB_FETCH_TIMEOUT_MS: ${process.env.GITHUB_FETCH_TIMEOUT_MS}`,
  );
  process.exit(1);
}

if (
  !Number.isInteger(env.SCAN_RETENTION_DAYS) ||
  env.SCAN_RETENTION_DAYS <= 0
) {
  console.error(
    `❌ Invalid SCAN_RETENTION_DAYS: ${process.env.SCAN_RETENTION_DAYS}`,
  );
  process.exit(1);
}

for (const [name, value] of [
  ['FRONTEND_URL', env.FRONTEND_URL],
  ['GITHUB_CALLBACK_URL', env.GITHUB_CALLBACK_URL],
  ['DATABASE_URL', env.DATABASE_URL],
  ['REDIS_URL', env.REDIS_URL],
] as const) {
  try {
    new URL(value);
  } catch {
    console.error(`❌ Invalid ${name}: ${value}`);
    process.exit(1);
  }
}

if (isProd && !env.FRONTEND_URL.startsWith('https://')) {
  console.warn(
    `⚠️  FRONTEND_URL is not HTTPS in production: ${env.FRONTEND_URL}`,
  );
}

if (env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

if (env.TOKEN_ENCRYPTION_KEY.length !== 64) {
  console.error('❌ TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  process.exit(1);
}