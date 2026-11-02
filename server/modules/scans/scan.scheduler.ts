import { scanQueue, type ScheduledScanJobData } from './scan.queue.js';

export const REPO_RESCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const SCHEDULED_SCAN_JOB_NAME = 'scheduled-scan';

export function repoRescanSchedulerId(repoId: string): string {
  return `repo-scan:${repoId}`;
}

export function repoRescanTemplate(repoId: string): {
  name: string;
  data: ScheduledScanJobData;
} {
  return {
    name: SCHEDULED_SCAN_JOB_NAME,
    data: { repoId },
  };
}

export async function upsertRepoRescanScheduler(
  repoId: string,
  every = REPO_RESCAN_INTERVAL_MS,
): Promise<void> {
  await scanQueue.upsertJobScheduler(
    repoRescanSchedulerId(repoId),
    { every },
    repoRescanTemplate(repoId),
  );
}

export async function removeRepoRescanScheduler(
  repoId: string,
): Promise<boolean> {
  return scanQueue.removeJobScheduler(repoRescanSchedulerId(repoId));
}
