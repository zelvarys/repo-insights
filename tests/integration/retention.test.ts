import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool, closeDb } from '../../server/config/database.js';
import { pruneOldScans } from '../../server/modules/scans/scan.retention.js';
import { truncateAll, insertUser, insertRepository } from '../helpers/db.js';

let userId: string;
let repoId: string;

beforeEach(async () => {
  await truncateAll();
  userId = await insertUser({ githubId: 900, username: 'retention' });
  repoId = await insertRepository({
    githubId: 901,
    owner: 'test',
    name: 'retention',
    addedBy: userId,
  });
});

afterAll(async () => {
  await truncateAll();
  await closeDb();
});

async function insertScan(
  status: 'complete' | 'failed',
  ageDays: number,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (repo_id, status, created_at, completed_at)
     VALUES ($1, $2, NOW() - ($3::int * INTERVAL '1 day'),
             NOW() - ($3::int * INTERVAL '1 day'))
     RETURNING id`,
    [repoId, status, ageDays],
  );
  return rows[0]!.id;
}

describe('scan retention', () => {
  it('prunes old scans but keeps the latest completed scan per repo', async () => {
    const oldest = await insertScan('complete', 200);
    const latest = await insertScan('complete', 120);
    const failed = await insertScan('failed', 300);

    await pool.query(
      `INSERT INTO tool_usage (scan_id, repo_id, tool_name, category, detected)
       VALUES ($1, $2, 'eslint', 'linting', TRUE)`,
      [oldest, repoId],
    );
    await pool.query(
      `INSERT INTO tracked_tools (repo_id, tool_name)
       VALUES ($1, 'eslint')`,
      [repoId],
    );

    const removed = await pruneOldScans(90);
    expect(removed).toBe(2);

    const scans = await pool.query<{ id: string }>(
      'SELECT id FROM scans WHERE repo_id = $1',
      [repoId],
    );
    expect(scans.rows.map((row) => row.id)).toEqual([latest]);
    expect(scans.rows.some((row) => row.id === failed)).toBe(false);

    const toolUsage = await pool.query(
      'SELECT id FROM tool_usage WHERE scan_id = $1',
      [oldest],
    );
    expect(toolUsage.rowCount).toBe(0);

    const trackedTools = await pool.query(
      'SELECT tool_name FROM tracked_tools WHERE repo_id = $1',
      [repoId],
    );
    expect(trackedTools.rowCount).toBe(1);
  });
});
