import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const RETENTION_LOCK_KEY = 'repositron:scan-retention';

export async function pruneOldScans(retentionDays: number): Promise<number> {
  const client = await pool.connect();
  let locked = false;

  try {
    const lock = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1::text, 0)) AS locked',
      [RETENTION_LOCK_KEY],
    );
    locked = lock.rows[0]?.locked ?? false;
    if (!locked) return 0;

    const result = await client.query(
      `WITH keep AS (
         SELECT DISTINCT ON (repo_id) id
         FROM scans
         WHERE status = 'complete'
         ORDER BY repo_id, COALESCE(completed_at, created_at) DESC
       )
       DELETE FROM scans s
       WHERE s.created_at < NOW() - ($1::int * INTERVAL '1 day')
         AND s.id NOT IN (SELECT id FROM keep)`,
      [retentionDays],
    );

    return result.rowCount ?? 0;
  } finally {
    if (locked) {
      await client
        .query(
          'SELECT pg_advisory_unlock(hashtextextended($1::text, 0))',
          [RETENTION_LOCK_KEY],
        )
        .catch((err: Error) => {
          logger.warn(
            `Failed to release scan retention lock: ${err.message}`,
          );
        });
    }
    client.release();
  }
}
