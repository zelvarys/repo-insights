import type {
  ContributorConcentration,
  ContributorShare,
} from '../../../shared/types.js';

export type AuthorCommit = {
  authorLogin: string | null;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeGini(counts: number[]): number {
  const values = counts.filter((n) => n > 0).sort((a, b) => a - b);
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return 1;
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  let weighted = 0;
  for (let index = 0; index < n; index += 1) {
    weighted += (index + 1) * values[index]!;
  }
  return round2((2 * weighted) / (n * total) - (n + 1) / n);
}

export function concentrationRisk(
  top3Share: number,
): 'green' | 'yellow' | 'red' {
  if (top3Share < 50) return 'green';
  if (top3Share > 75) return 'red';
  return 'yellow';
}

export function computeConcentration(
  commits: AuthorCommit[],
): ContributorConcentration {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const login = commit.authorLogin ?? 'unknown';
    counts.set(login, (counts.get(login) ?? 0) + 1);
  }

  const totalCommits = commits.length;
  const sorted = [...counts.entries()]
    .map(([login, value]) => ({ login, commits: value }))
    .sort((a, b) => b.commits - a.commits || a.login.localeCompare(b.login));

  const share = (count: number): number =>
    totalCommits === 0 ? 0 : round2((count / totalCommits) * 100);
  const sumTop = (n: number): number =>
    sorted.slice(0, n).reduce((sum, row) => sum + row.commits, 0);

  const topContributors: ContributorShare[] = sorted.slice(0, 10).map((row) => ({
    ...row,
    share: share(row.commits),
  }));

  const top3Share = share(sumTop(3));
  return {
    totalCommits,
    contributorCount: sorted.length,
    top1Share: share(sumTop(1)),
    top3Share,
    top10Share: share(sumTop(10)),
    gini: computeGini(sorted.map((row) => row.commits)),
    risk: concentrationRisk(top3Share),
    topContributors,
  };
}
