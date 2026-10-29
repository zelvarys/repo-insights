import { describe, expect, it } from 'vitest';
import type { CiHealth } from '../../shared/types.js';
import { buildRepoStructure } from '../../server/modules/insights/structure.js';
import { buildCommitActivity, selectActivity } from '../../server/modules/insights/activity.js';
import { computeCommitQuality } from '../../server/modules/insights/commit-quality.js';
import { computeConcentration, computeGini, concentrationRisk } from '../../server/modules/insights/concentration.js';
import { aggregateCiHealth, filterCiRuns } from '../../server/modules/insights/ci.js';
import { computeRepoHealth } from '../../server/modules/insights/health-score.js';

describe('repo structure', () => {
  it('builds a nested tree with directory totals and file types', () => {
    const structure = buildRepoStructure(
      [
        { path: 'src', type: 'tree' },
        { path: 'src/index.ts', type: 'blob', size: 100 },
        { path: 'src/lib', type: 'tree' },
        { path: 'src/lib/a.ts', type: 'blob', size: 50 },
        { path: 'README.md', type: 'blob', size: 20 },
        { path: 'src/index.ts', type: 'commit' },
      ],
      { 'src/lib/a.ts': '2026-01-01T00:00:00.000Z' },
    );

    expect(structure.fileCount).toBe(3);
    expect(structure.directoryCount).toBe(2);
    expect(structure.totalSize).toBe(170);
    expect(structure.tree.map((node) => node.name)).toEqual(['src', 'README.md']);
    const src = structure.tree[0]!;
    expect(src.fileCount).toBe(2);
    expect(src.size).toBe(150);
    const lib = src.children?.find((node) => node.name === 'lib');
    expect(lib?.children?.[0]?.lastModified).toBe('2026-01-01T00:00:00.000Z');
    expect(structure.fileTypes).toEqual([
      { extension: '.ts', count: 2, sizeBytes: 150 },
      { extension: '.md', count: 1, sizeBytes: 20 },
    ]);
  });

  it('caps entries and marks the result truncated', () => {
    const entries = [
      { path: 'src', type: 'tree' as const },
      ...Array.from({ length: 510 }, (_, index) => ({
        path: `src/file-${index}.ts`,
        type: 'blob' as const,
        size: 1,
      })),
    ];
    const structure = buildRepoStructure(entries);
    expect(structure.fileCount).toBeLessThanOrEqual(500);
    expect(structure.truncated).toBe(true);
  });
});

describe('commit activity and quality', () => {
  const now = new Date('2026-10-29T12:00:00.000Z');
  const commits = [
    {
      sha: '1',
      authorLogin: 'alice',
      message: 'feat: add thing\n\nA longer body.',
      date: '2026-10-29T01:00:00.000Z',
    },
    {
      sha: '2',
      authorLogin: 'bob',
      message: 'fix: edge case',
      date: '2026-10-28T23:30:00.000Z',
    },
    {
      sha: '3',
      authorLogin: 'alice',
      message: 'Merge pull request #1 from x/y',
      date: '2026-10-20T10:00:00.000Z',
    },
    {
      sha: '4',
      authorLogin: 'carol',
      message: 'update stuff',
      date: '2026-07-01T00:00:00.000Z',
    },
    {
      sha: '5',
      authorLogin: 'dave',
      message: 'docs: old',
      date: '2025-01-01T00:00:00.000Z',
    },
  ];

  it('buckets by UTC day and filters by range', () => {
    const stored = buildCommitActivity(commits, now);
    const activity = selectActivity(stored, 90);
    expect(activity.daily).toMatchObject({
      '2026-10-29': 1,
      '2026-10-28': 1,
      '2026-10-20': 1,
    });
    expect(activity.daily['2025-01-01']).toBeUndefined();
    expect(activity.topContributors[0]).toEqual({ login: 'alice', commits: 2 });
    expect(activity.weekday[4]).toBeGreaterThanOrEqual(1);
    expect(activity.hourOfDay[23]).toBe(1);
    expect(activity.weekly.some((week) => week.count >= 1)).toBe(true);
    expect(activity.quality.mostCommonType).toBe('feat');
  });

  it('computes Conventional Commits and body percentages without merge commits', () => {
    const quality = computeCommitQuality(commits);
    expect(quality.totalCommits).toBe(4);
    expect(quality.conventionalPercent).toBe(75);
    expect(quality.bodyPercent).toBe(25);
    expect(quality.mostCommonType).toBe('docs');
    expect(quality.examples).toEqual(['update stuff']);
    expect(quality.messageLengthBuckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4);
  });

  it('sanitizes emails and mentions in examples', () => {
    const quality = computeCommitQuality([
      { message: 'thanks @alice and bob@example.com' },
    ]);
    expect(quality.examples[0]).toBe('thanks @user and [email]');
  });

  it('ignores merge commits and empty messages', () => {
    const quality = computeCommitQuality([
      { message: 'Merge branch main' },
      { message: '   ' },
    ]);
    expect(quality.totalCommits).toBe(0);
    expect(quality.examples).toEqual([]);
  });
});

describe('contributor concentration', () => {
  it('computes shares, Gini, and risk buckets', () => {
    const result = computeConcentration([
      ...Array.from({ length: 8 }, () => ({ authorLogin: 'alice' })),
      ...Array.from({ length: 1 }, () => ({ authorLogin: 'bob' })),
      ...Array.from({ length: 1 }, () => ({ authorLogin: 'carol' })),
    ]);
    expect(result.top1Share).toBe(80);
    expect(result.top3Share).toBe(100);
    expect(result.risk).toBe('red');
    expect(result.topContributors[0]).toEqual({
      login: 'alice',
      commits: 8,
      share: 80,
    });
  });

  it('returns zeroes for no commits', () => {
    const result = computeConcentration([]);
    expect(result.totalCommits).toBe(0);
    expect(result.gini).toBe(0);
    expect(result.risk).toBe('green');
  });

  it('handles even and uneven Gini values', () => {
    expect(computeGini([1, 1, 1, 1])).toBe(0);
    expect(computeGini([1, 1, 1, 9])).toBe(0.5);
  });

  it('buckets risk at the documented boundaries', () => {
    expect(concentrationRisk(49.99)).toBe('green');
    expect(concentrationRisk(50)).toBe('yellow');
    expect(concentrationRisk(75)).toBe('yellow');
    expect(concentrationRisk(75.01)).toBe('red');
  });
});

describe('CI health', () => {
  const runs = [
    { runId: 1, workflowName: 'CI', status: 'completed', conclusion: 'success', branch: 'main', actor: 'alice', startedAt: '2026-10-01T00:00:00Z', completedAt: '2026-10-01T00:01:00Z', durationSeconds: 60, url: null },
    { runId: 2, workflowName: 'CI', status: 'completed', conclusion: 'failure', branch: 'main', actor: 'bob', startedAt: '2026-10-02T00:00:00Z', completedAt: '2026-10-02T00:02:00Z', durationSeconds: 120, url: null },
    { runId: 3, workflowName: 'Deploy', status: 'completed', conclusion: 'success', branch: 'dev', actor: 'carol', startedAt: '2026-10-03T00:00:00Z', completedAt: '2026-10-03T00:03:00Z', durationSeconds: 180, url: null },
    { runId: 4, workflowName: 'CI', status: 'completed', conclusion: 'cancelled', branch: 'main', actor: 'dave', startedAt: '2026-10-04T00:00:00Z', completedAt: '2026-10-04T00:00:30Z', durationSeconds: 30, url: null },
  ];

  it('aggregates success rates and durations per workflow', () => {
    const health = aggregateCiHealth(runs, false, '2026-10-05T00:00:00Z');
    expect(health.totalRuns).toBe(4);
    expect(health.successRate).toBe(50);
    const ci = health.workflows.find((workflow) => workflow.name === 'CI')!;
    expect(ci.totalRuns).toBe(3);
    expect(ci.successfulRuns).toBe(1);
    expect(ci.failedRuns).toBe(1);
    expect(ci.successRate).toBe(33.33);
    expect(ci.averageDurationSeconds).toBe(70);
    expect(health.recentFailures.map((failure) => failure.runId)).toEqual([2]);
  });

  it('filters by workflow, branch, and time range', () => {
    expect(filterCiRuns(runs, { workflow: 'Deploy' })).toHaveLength(1);
    expect(filterCiRuns(runs, { branch: 'main' })).toHaveLength(3);
    expect(
      filterCiRuns(runs, { range: 30, now: new Date('2026-10-05T00:00:00Z') }),
    ).toHaveLength(4);
    expect(
      filterCiRuns(runs, { range: 30, now: new Date('2027-01-05T00:00:00Z') }),
    ).toHaveLength(0);
  });

  it('returns an unavailable-shaped empty aggregate', () => {
    const health = aggregateCiHealth([]);
    expect(health.successRate).toBeNull();
    expect(health.totalRuns).toBe(0);
    expect(health.workflows).toEqual([]);
  });
});

describe('repo health score', () => {
  const quality = computeCommitQuality([
    { message: 'feat: one' },
    { message: 'fix: two' },
    { message: 'bad message' },
  ]);

  it('uses the documented weights when all components are available', () => {
    const health = computeRepoHealth({
      commitsLast90: 50,
      dependencies: {
        total: 10,
        checked: 10,
        outdated: 2,
        advisoryCount: 0,
        severity: { low: 0, moderate: 0, high: 0, critical: 0 },
        partial: false,
        checkedAt: null,
      },
      ciSuccessRate: 80,
      ciTotalRuns: 20,
      concentration: {
        totalCommits: 10,
        contributorCount: 2,
        top1Share: 60,
        top3Share: 60,
        top10Share: 100,
        gini: 0.2,
        risk: 'yellow',
        topContributors: [],
      },
      quality,
    });
    expect(health.score).toBe(83);
  });

  it('renormalizes missing components', () => {
    const health = computeRepoHealth({
      commitsLast90: 25,
      ciSuccessRate: 100,
      ciTotalRuns: 5,
      quality,
    });
    const available = health.components.filter((component) => component.available);
    expect(available.map((component) => component.key)).toEqual([
      'activity',
      'ci',
      'commitQuality',
    ]);
    expect(health.score).toBe(70.83);
  });

  it('scores a repo with zero recent commits from the activity component alone', () => {
    const health = computeRepoHealth({
      commitsLast90: 0,
      dependencies: null,
      ciSuccessRate: null,
      ciTotalRuns: 0,
      concentration: null,
      quality: null,
    });
    expect(health.score).toBe(0);
    expect(health.components.filter((component) => component.available)).toHaveLength(1);
    expect(health.components[0]).toMatchObject({ key: 'activity', score: 0, available: true });
  });
});
