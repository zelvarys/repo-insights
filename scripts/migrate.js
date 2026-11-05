import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');
const MIGRATION_LOCK_KEY = 'repositron:migrations';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let locked = false;

  try {
    await client.query(
      'SELECT pg_advisory_lock(hashtextextended($1::text, 0))',
      [MIGRATION_LOCK_KEY],
    );
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      'ALTER TABLE migrations ADD COLUMN IF NOT EXISTS checksum TEXT',
    );

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows } = await client.query(
      'SELECT name, checksum FROM migrations',
    );
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const priorChecksum = applied.get(file);

      if (priorChecksum !== undefined) {
        if (priorChecksum && priorChecksum !== checksum) {
          throw new Error(
            `Checksum mismatch for applied migration ${file}; refusing to continue`,
          );
        }
        if (!priorChecksum) {
          await client.query(
            'UPDATE migrations SET checksum = $2 WHERE name = $1',
            [file, checksum],
          );
          console.log(`[CHECKSUM] ${file}`);
        } else {
          console.log(`[SKIP] ${file}`);
        }
        continue;
      }

      console.log(`[APPLY] ${file}`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations (name, checksum) VALUES ($1, $2)',
          [file, checksum],
        );
        await client.query('COMMIT');
        console.log(`[DONE] ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`[FAIL] ${file}: ${err.message}`);
      }
    }
  } finally {
    if (locked) {
      await client
        .query(
          'SELECT pg_advisory_unlock(hashtextextended($1::text, 0))',
          [MIGRATION_LOCK_KEY],
        )
        .catch(() => {});
    }
    await client.end();
  }

  console.log('✅ Migrations complete');
}

main().catch((err) => {
  console.error('❌ Migration runner failed:', err);
  process.exit(1);
});
