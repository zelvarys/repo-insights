import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const testEnvPath = path.resolve(rootDir, '.env.test');

if (!existsSync(testEnvPath)) {
  throw new Error(
    'Missing .env.test. Create .env.test with NODE_ENV=test and DATABASE_URL pointing at a _test database.',
  );
}

config({ path: testEnvPath, override: false });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
