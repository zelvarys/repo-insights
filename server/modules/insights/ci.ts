import type {
  CiFailure,
  CiHealth,
  WorkflowHealth,
} from '../../../shared/types.js';

export type CiRun = {
  runId: number;
  workflowName: string;
  status: string;
  conclusion: string | null;
  branch: string | null;
  actor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  url: string | null;
};

export type CiFilter = {
  workflow?: string;
  branch?: string;
  range?: 30 | 90 | 365;
  now?: Date;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isFailure(conclusion: string | null): boolean {
  return conclusion === 'failure' || conclusion === 'timed_out';
}

function completedAtMs(run: CiRun): number {
  return Date.parse(run.completedAt ?? run.startedAt ?? '') || 0;
}

export function filterCiRuns(runs: CiRun[], filter: CiFilter = {}): CiRun[] {
  const now = filter.now ?? new Date();
  const cutoff = filter.range
    ? now.getTime() - filter.range * 24 * 60 * 60 * 1000
    : null;
  return runs.filter((run) => {
    if (filter.workflow && run.workflowName !== filter.workflow) return false;
    if (filter.branch && run.branch !== filter.branch) return false;
    if (cutoff !== null) {
      const time = Date.parse(run.completedAt ?? run.startedAt ?? '');
      if (!Number.isFinite(time) || time < cutoff || time > now.getTime()) {
        return false;
      }
    }
    return true;
  });
}

export function aggregateCiHealth(
  runs: CiRun[],
  partial = false,
  fetchedAt: string | null = null,
): CiHealth {
  const completed = runs
    .filter((run) => run.status === 'completed')
    .sort((a, b) => completedAtMs(b) - completedAtMs(a));

  const buckets = new Map<string, CiRun[]>();
  for (const run of completed) {
    const list = buckets.get(run.workflowName) ?? [];
    list.push(run);
    buckets.set(run.workflowName, list);
  }

  const workflows: WorkflowHealth[] = [...buckets.entries()]
    .map(([name, workflowRuns]) => {
      const sample = workflowRuns.slice(0, 50);
      const successfulRuns = sample.filter(
        (run) => run.conclusion === 'success',
      ).length;
      const failedRuns = sample.filter((run) => isFailure(run.conclusion)).length;
      const durations = sample
        .map((run) => run.durationSeconds)
        .filter((value): value is number => value !== null && value >= 0);
      return {
        name,
        totalRuns: sample.length,
        successfulRuns,
        failedRuns,
        successRate:
          sample.length === 0
            ? 0
            : round2((successfulRuns / sample.length) * 100),
        averageDurationSeconds:
          durations.length === 0
            ? null
            : Math.round(
                durations.reduce((sum, value) => sum + value, 0) /
                  durations.length,
              ),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const successCount = completed.filter(
    (run) => run.conclusion === 'success',
  ).length;
  const recentFailures: CiFailure[] = completed
    .filter((run) => isFailure(run.conclusion))
    .slice(0, 10)
    .map((run) => ({
      runId: run.runId,
      workflowName: run.workflowName,
      branch: run.branch,
      actor: run.actor,
      conclusion: run.conclusion,
      completedAt: run.completedAt,
      url: run.url,
    }));

  return {
    successRate:
      completed.length === 0
        ? null
        : round2((successCount / completed.length) * 100),
    totalRuns: completed.length,
    workflows,
    recentFailures,
    partial,
    fetchedAt,
  };
}

export function worstWorkflow(health: CiHealth): string | null {
  const eligible = health.workflows.filter((workflow) => workflow.totalRuns > 10);
  if (eligible.length === 0) return null;
  return [...eligible].sort(
    (a, b) => a.successRate - b.successRate || a.name.localeCompare(b.name),
  )[0]!.name;
}
