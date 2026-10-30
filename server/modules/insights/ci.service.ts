import { pool } from '../../config/database.js';
import type { CiRun } from './ci.js';

export async function persistCiRuns(scanId: string, runs: CiRun[]): Promise<void> {
  await pool.query('DELETE FROM scan_ci_runs WHERE scan_id = $1', [scanId]);
  for (const run of runs) {
    await pool.query(
      `INSERT INTO scan_ci_runs
         (scan_id, run_id, workflow_name, status, conclusion, branch, actor,
          started_at, completed_at, duration_seconds, url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (scan_id, run_id) DO UPDATE SET
         workflow_name = EXCLUDED.workflow_name,
         status = EXCLUDED.status,
         conclusion = EXCLUDED.conclusion,
         branch = EXCLUDED.branch,
         actor = EXCLUDED.actor,
         started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at,
         duration_seconds = EXCLUDED.duration_seconds,
         url = EXCLUDED.url`,
      [
        scanId,
        run.runId,
        run.workflowName,
        run.status,
        run.conclusion,
        run.branch,
        run.actor,
        run.startedAt,
        run.completedAt,
        run.durationSeconds,
        run.url,
      ],
    );
  }
}

export async function loadCiRuns(scanId: string): Promise<CiRun[]> {
  const { rows } = await pool.query<{
    run_id: string;
    workflow_name: string;
    status: string;
    conclusion: string | null;
    branch: string | null;
    actor: string | null;
    started_at: Date | null;
    completed_at: Date | null;
    duration_seconds: number | null;
    url: string | null;
  }>(
    `SELECT run_id, workflow_name, status, conclusion, branch, actor,
            started_at, completed_at, duration_seconds, url
     FROM scan_ci_runs
     WHERE scan_id = $1
     ORDER BY started_at DESC NULLS LAST, run_id DESC`,
    [scanId],
  );
  return rows.map((row) => ({
    runId: Number(row.run_id),
    workflowName: row.workflow_name,
    status: row.status,
    conclusion: row.conclusion,
    branch: row.branch,
    actor: row.actor,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    durationSeconds: row.duration_seconds,
    url: row.url,
  }));
}
