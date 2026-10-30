import type { CommitQuality } from '../../../shared/types.js';

export type QualityCommit = {
  message: string;
};

const CONVENTIONAL_RE =
  /^(feat|fix|docs|chore|refactor|test|style|perf)(\(.+\))?!?:/;
const MERGE_RE = /^Merge (pull request|branch|remote-tracking branch|tag)\b/i;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/@[A-Za-z0-9_-]+/g, '@user')
    .slice(0, 120);
}

export function isMergeCommit(message: string): boolean {
  return MERGE_RE.test(message.trim());
}

export function computeCommitQuality(commits: QualityCommit[]): CommitQuality {
  const relevant = commits.filter((commit) => {
    const firstLine = commit.message.split(/\r?\n/, 1)[0]?.trim() ?? '';
    return firstLine.length > 0 && !isMergeCommit(firstLine);
  });

  let conventional = 0;
  let withBody = 0;
  let firstLineLength = 0;
  let bodyLength = 0;
  const typeCounts = new Map<string, number>();
  const malformed: string[] = [];
  const lengthBuckets = [0, 0, 0, 0, 0];

  for (const commit of relevant) {
    const lines = commit.message.split(/\r?\n/);
    const firstLine = lines[0]?.trim() ?? '';
    const body = lines.slice(1).join('\n').trim();
    firstLineLength += firstLine.length;
    const bucket = Math.min(4, Math.floor(firstLine.length / 21));
    lengthBuckets[bucket]! += 1;

    const match = CONVENTIONAL_RE.exec(firstLine);
    if (match) {
      conventional += 1;
      const type = match[1]!;
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    } else {
      malformed.push(sanitizeMessage(firstLine));
    }

    if (body.length > 0) {
      withBody += 1;
      bodyLength += body.length;
    }
  }

  const total = relevant.length;
  const mostCommonType =
    [...typeCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0] ?? null;

  const examples = [...new Set(malformed)]
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 5);

  return {
    totalCommits: total,
    conventionalPercent: total === 0 ? 0 : round2((conventional / total) * 100),
    bodyPercent: total === 0 ? 0 : round2((withBody / total) * 100),
    averageMessageLength: total === 0 ? 0 : round2(firstLineLength / total),
    averageBodyLength: withBody === 0 ? 0 : round2(bodyLength / withBody),
    mostCommonType,
    examples,
    messageLengthBuckets: [
      { label: '0-20', count: lengthBuckets[0]! },
      { label: '21-40', count: lengthBuckets[1]! },
      { label: '41-60', count: lengthBuckets[2]! },
      { label: '61-80', count: lengthBuckets[3]! },
      { label: '81+', count: lengthBuckets[4]! },
    ],
  };
}
