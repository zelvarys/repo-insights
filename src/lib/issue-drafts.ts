import type { ContributorConcentration, OverviewCards } from '@shared/types'
import { formatPercent } from '@/lib/format'

export type IssueDraft = {
  title: string
  body: string
}

type DependencyFinding = NonNullable<OverviewCards['dependencies']>

export function dependencyIssueDraft(
  repoFullName: string,
  finding: DependencyFinding,
): IssueDraft {
  const advisoryLine =
    finding.advisoryCount > 0
      ? `${finding.advisoryCount} known advisor${finding.advisoryCount === 1 ? 'y' : 'ies'} were found.`
      : 'No known advisories were found.'
  return {
    title: `Dependency health: ${finding.outdated} outdated packages in ${repoFullName}`,
    body: [
      '## Finding',
      `${finding.outdated} of ${finding.total} direct dependencies are outdated.`,
      advisoryLine,
      finding.partial
        ? 'Dependency data was partial at scan time; some registries may have been unavailable.'
        : null,
      '',
      '## Suggested next steps',
      '- Review the outdated dependencies in the repository.',
      '- Update compatible packages and run the test suite.',
      '- Re-scan the repository after updating.',
      '',
      '_Detected by repo-insights from the latest dependency scan._',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  }
}

export function concentrationIssueDraft(
  repoFullName: string,
  concentration: ContributorConcentration,
): IssueDraft {
  const lead = concentration.topContributors[0]
  const risk =
    concentration.risk === 'red'
      ? 'high'
      : concentration.risk === 'yellow'
        ? 'moderate'
        : 'low'
  return {
    title: `Contributor concentration risk in ${repoFullName}`,
    body: [
      '## Finding',
      `Contributor concentration is ${risk} risk for ${repoFullName}.`,
      `- Top contributor: ${lead?.login ?? 'unknown'} (${formatPercent(concentration.top1Share)})`,
      `- Top 3 share: ${formatPercent(concentration.top3Share)}`,
      `- Top 10 share: ${formatPercent(concentration.top10Share)}`,
      `- Gini coefficient: ${concentration.gini.toFixed(3)}`,
      '',
      '## Suggested next steps',
      '- Document ownership and review responsibilities.',
      '- Encourage more contributors to review and merge changes.',
      '- Track concentration again after the next scan.',
      '',
      '_Detected by repo-insights from the latest commit history._',
    ].join('\n'),
  }
}
