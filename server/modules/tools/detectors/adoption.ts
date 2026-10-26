export function computeAdoptionRate(
  contributorLogins: readonly string[],
  perContributor: Record<string, boolean>,
  detected: boolean,
): number {
  if (!detected) return 0;

  const contributors = new Set(contributorLogins);
  if (contributors.size === 0) return 0;

  let usingCount = 0;
  for (const login of contributors) {
    if (perContributor[login]) usingCount++;
  }

  return Math.min(
    100,
    Math.round((usingCount / contributors.size) * 10000) / 100,
  );
}
