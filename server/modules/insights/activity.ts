import type {
  CommitActivity,
  CommitQuality,
  ContributorActivity,
} from '../../../shared/types.js';
import { computeCommitQuality } from './commit-quality.js';

export type ActivityCommit = {
  sha: string;
  authorLogin: string | null;
  message: string;
  date: string;
};

export type ActivityRange = 90 | 180 | 365;

export type StoredActivity = {
  quality: CommitQuality;
  ranges: Record<ActivityRange, Omit<CommitActivity, 'range' | 'quality'>>;
};

const RANGE_DAYS: ActivityRange[] = [90, 180, 365];
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekStart(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - offset);
  return isoDay(date);
}

function withinRange(date: string, now: Date, days: number): boolean {
  const parsed = Date.parse(date);
  if (!Number.isFinite(parsed)) return false;
  const start = now.getTime() - (days - 1) * DAY_MS;
  return parsed >= start && parsed <= now.getTime();
}

export function buildCommitActivity(
  commits: ActivityCommit[],
  now = new Date(),
): StoredActivity {
  const valid = commits.filter((commit) => Number.isFinite(Date.parse(commit.date)));
  const quality = computeCommitQuality(
    valid.filter((commit) => withinRange(commit.date, now, 365)),
  );

  const ranges = {} as StoredActivity['ranges'];
  for (const range of RANGE_DAYS) {
    const inRange = valid.filter((commit) => withinRange(commit.date, now, range));
    const daily = new Map<string, number>();
    const authors = new Map<string, number>();
    const weekday = Array.from({ length: 7 }, () => 0);
    const hourOfDay = Array.from({ length: 24 }, () => 0);

    for (const commit of inRange) {
      const date = new Date(commit.date);
      const day = isoDay(date);
      daily.set(day, (daily.get(day) ?? 0) + 1);
      const login = commit.authorLogin ?? 'unknown';
      authors.set(login, (authors.get(login) ?? 0) + 1);
      weekday[date.getUTCDay()]! += 1;
      hourOfDay[date.getUTCHours()]! += 1;
    }

    const weekly = new Map<string, number>();
    for (const [day, count] of daily) {
      const start = weekStart(day);
      weekly.set(start, (weekly.get(start) ?? 0) + count);
    }

    const topContributors: ContributorActivity[] = [...authors.entries()]
      .map(([login, count]) => ({ login, commits: count }))
      .sort((a, b) => b.commits - a.commits || a.login.localeCompare(b.login))
      .slice(0, 20);

    ranges[range] = {
      daily: Object.fromEntries([...daily.entries()].sort()),
      weekly: [...weekly.entries()]
        .sort()
        .map(([weekStartDate, count]) => ({
          weekStart: weekStartDate,
          count,
        })),
      topContributors,
      weekday,
      hourOfDay,
    };
  }

  return { quality, ranges };
}

export function selectActivity(
  stored: StoredActivity,
  range: ActivityRange,
): CommitActivity {
  return {
    range,
    quality: stored.quality,
    ...stored.ranges[range],
  };
}
