import { pool } from '../../config/database.js';
import { scanQueue, type ScanJobData } from './scan.queue.js';
import { getTrackedRepository } from '../repositories/repository.service.js';
import { cacheGet, cacheSet, cacheDel, cacheKeys } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import { serviceUnavailable } from '../../utils/errors.js';
import type { ScanSummary, ScanStatus } from '../../../shared/types.js';

function toScan(row: {
  id: string;
  repo_id: string;
  status: string;
  started_at: Date | null;
  completed_at: Date | null;
  error: string | null;
  summary: unknown;
  created_at: Date;
}): ScanSummary {
  return {
    id: row.id,
    repoId: row.repo_id,
    status: row.status as ScanStatus,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    error: row.error,
    summary: (row.summary as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

const FRESH_SCAN_TTL_SECONDS = 60 * 60;
const PENDING_STALE_AFTER_MS = 10 * 60 * 1000;
const RUNNING_STALE_AFTER_MS = 30 * 60 * 1000;

function staleScanError(status: string, createdAt: Date): string | null {
  const age = Date.now() - createdAt.getTime();
  if (status === 'pending' && age > PENDING_STALE_AFTER_MS) {
    return 'Scan timed out before starting';
  }
  if (status === 'running' && age > RUNNING_STALE_AFTER_MS) {
    return 'Scan timed out while running';
  }
  return null;
}

function isRedisUnavailableError(err: unknown): boolean {
  const error = err as { code?: string; message?: string };
  if (
    error.code &&
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'NR_CLOSED',
    ].includes(error.code)
  ) {
    return true;
  }
  return /redis|connection is closed|connection lost/i.test(error.message ?? '');
}

export async function failStalePendingScans(): Promise<number> {
  const result = await pool.query(
    `UPDATE scans
     SET status = 'failed', completed_at = NOW(),
         error = 'Scan timed out before starting'
     WHERE status = 'pending'
       AND created_at < NOW() - INTERVAL '10 minutes'`,
  );
  return result.rowCount ?? 0;
}

export async function requestScan(
  repoId: string,
  userId: string,
): Promise<{ scan: ScanSummary; cached: boolean }> {
  await getTrackedRepository(repoId);

  const cached = await cacheGet<{ scan: ScanSummary; writtenAt: number }>(
    cacheKeys.scanResult(repoId),
  );
  if (cached) {
    return { scan: cached.scan, cached: true };
  }

  let scan: ScanSummary | null = null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',
      [repoId],
    );

    const existing = await client.query<{
      id: string;
      repo_id: string;
      status: string;
      started_at: Date | null;
      completed_at: Date | null;
      error: string | null;
      summary: unknown;
      created_at: Date;
    }>(
      `SELECT id, repo_id, status, started_at, completed_at, error,
              summary, created_at
       FROM scans
       WHERE repo_id = $1 AND status IN ('pending','running')
       ORDER BY created_at DESC
       LIMIT 1`,
      [repoId],
    );
    const inFlight = existing.rows[0];
    if (inFlight) {
      const staleError = staleScanError(inFlight.status, inFlight.created_at);
      if (!staleError) {
        await client.query('COMMIT');
        return { scan: toScan(inFlight), cached: true };
      }
      await client.query(
        `UPDATE scans
         SET status = 'failed', completed_at = NOW(), error = $2
         WHERE id = $1`,
        [inFlight.id, staleError],
      );
    }

    const insert = await client.query(
      `INSERT INTO scans (repo_id, status)
       VALUES ($1, 'pending')
       RETURNING id, repo_id, status, started_at, completed_at, error,
                 summary, created_at`,
      [repoId],
    );
    scan = toScan(insert.rows[0]!);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (!scan) {
    throw new Error(`Failed to create scan for repository ${repoId}`);
  }

  const jobData: ScanJobData = {
    scanId: scan.id,
    repoId,
    requestedBy: userId,
  };
  try {
    await scanQueue.add('scan', jobData, { jobId: scan.id });
  } catch (err) {
    try {
      await pool.query(
        `UPDATE scans
         SET status = 'failed', completed_at = NOW(),
             error = 'Failed to enqueue scan'
         WHERE id = $1`,
        [scan.id],
      );
    } catch (updateErr) {
      logger.warn(
        `Failed to mark scan ${scan.id} as failed after enqueue error: ${(updateErr as Error).message}`,
      );
    }

    if (isRedisUnavailableError(err)) {
      throw serviceUnavailable('Scan queue is unavailable');
    }
    throw err;
  }

  return { scan, cached: false };
}

type CachedScan = { scan: ScanSummary; writtenAt: number };

export function shouldReplaceCachedScan(
  cached: CachedScan | null,
  incoming: Pick<ScanSummary, 'createdAt'>,
): boolean {
  if (!cached) return true;
  return (
    Date.parse(incoming.createdAt) >= Date.parse(cached.scan.createdAt)
  );
}

export async function cacheCompletedScan(scan: ScanSummary): Promise<void> {
  const key = cacheKeys.scanResult(scan.repoId);
  const cached = await cacheGet<CachedScan>(key);
  if (!shouldReplaceCachedScan(cached, scan)) return;

  await cacheSet(key, { scan, writtenAt: Date.now() }, FRESH_SCAN_TTL_SECONDS);
}

export async function invalidateScanCache(
  repoId: string,
  failedScan?: Pick<ScanSummary, 'createdAt'>,
): Promise<void> {
  const key = cacheKeys.scanResult(repoId);
  if (failedScan) {
    const cached = await cacheGet<CachedScan>(key);
    if (cached && !shouldReplaceCachedScan(cached, failedScan)) return;
  }
  await cacheDel(key);
}

export async function listScansForRepo(repoId: string): Promise<ScanSummary[]> {
  const { rows } = await pool.query(
    `SELECT id, repo_id, status, started_at, completed_at, error,
            summary, created_at
     FROM scans
     WHERE repo_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [repoId],
  );
  return rows.map(toScan);
}

export async function getScan(scanId: string): Promise<ScanSummary | null> {
  const { rows } = await pool.query(
    `SELECT id, repo_id, status, started_at, completed_at, error,
            summary, created_at
     FROM scans
     WHERE id = $1`,
    [scanId],
  );
  const row = rows[0];
  return row ? toScan(row) : null;
}