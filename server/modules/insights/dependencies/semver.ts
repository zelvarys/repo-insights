type ParsedVersion = {
  main: number[];
  prerelease: string[];
};

function parseVersion(value: string): ParsedVersion | null {
  const cleaned = value.trim().replace(/^v/i, '').split('+')[0]!;
  const [mainPart, prereleasePart] = cleaned.split('-', 2);
  if (!mainPart) return null;
  const main = mainPart.split('.').map((part) => Number(part));
  if (main.some((part) => !Number.isInteger(part) || part < 0)) return null;
  return {
    main,
    prerelease: prereleasePart ? prereleasePart.split('.') : [],
  };
}

function compareIdentifier(a: string, b: string): number {
  const aNumber = /^\d+$/.test(a) ? Number(a) : null;
  const bNumber = /^\d+$/.test(b) ? Number(b) : null;
  if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
  if (aNumber !== null) return -1;
  if (bNumber !== null) return 1;
  return a.localeCompare(b);
}

export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  const length = Math.max(left.main.length, right.main.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.main[index] ?? 0) - (right.main[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const prereleaseLength = Math.max(
    left.prerelease.length,
    right.prerelease.length,
  );
  for (let index = 0; index < prereleaseLength; index += 1) {
    const aPart = left.prerelease[index];
    const bPart = right.prerelease[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    const difference = compareIdentifier(aPart, bPart);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isOutdated(current: string, latest: string | null): boolean {
  if (!latest) return false;
  const currentVersion = parseVersion(current);
  const latestVersion = parseVersion(latest);
  if (!currentVersion || !latestVersion) return false;
  const currentMajor = currentVersion.main[0] ?? 0;
  const latestMajor = latestVersion.main[0] ?? 0;
  return latestMajor - currentMajor >= 1;
}
