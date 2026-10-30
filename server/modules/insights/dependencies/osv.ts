import { cacheGet, cacheSet, cacheKeys } from '../../../utils/cache.js';
import { logger } from '../../../utils/logger.js';
import type {
  DependencyEcosystem,
  DependencySeverity,
} from '../../../../shared/types.js';
import type { ParsedDependency } from './parsers.js';

const TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const BATCH_SIZE = 100;

export type Advisory = {
  id: string;
  severity: DependencySeverity | null;
};

export type AdvisoryLookup = {
  advisories: Map<string, Advisory[]>;
  partial: boolean;
};

const OSV_ECOSYSTEMS: Record<DependencyEcosystem, string> = {
  npm: 'npm',
  pypi: 'PyPI',
  go: 'Go',
  rubygems: 'RubyGems',
  packagist: 'Packagist',
};

function keyFor(dependency: ParsedDependency): string {
  return `${dependency.ecosystem}:${dependency.name}@${dependency.version}`;
}

function normalizeSeverity(value: unknown): DependencySeverity | null {
  if (typeof value !== 'string') return null;
  const severity = value.toLowerCase();
  if (severity === 'low') return 'low';
  if (severity === 'moderate' || severity === 'medium') return 'moderate';
  if (severity === 'high') return 'high';
  if (severity === 'critical') return 'critical';
  return null;
}

function severityFor(vulnerability: Record<string, unknown>): DependencySeverity | null {
  const databaseSpecific = vulnerability.database_specific;
  if (databaseSpecific && typeof databaseSpecific === 'object') {
    const severity = normalizeSeverity(
      (databaseSpecific as Record<string, unknown>).severity,
    );
    if (severity) return severity;
  }
  return null;
}

async function queryBatch(
  dependencies: ParsedDependency[],
): Promise<{ results: Advisory[][]; partial: boolean }> {
  const response = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'repo-insights',
    },
    body: JSON.stringify({
      queries: dependencies.map((dependency) => ({
        package: {
          name: dependency.name,
          ecosystem: OSV_ECOSYSTEMS[dependency.ecosystem],
        },
        version: dependency.version,
      })),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`OSV ${response.status}`);
  }
  const data = (await response.json()) as {
    results?: Array<{
      vulns?: Array<{
        id?: string;
        database_specific?: Record<string, unknown>;
      }>;
    }>;
  };
  const results = data.results ?? [];
  const partial = results.length !== dependencies.length;
  return {
    results: dependencies.map((_, index) => {
      const vulnerabilities = results[index]?.vulns ?? [];
      return vulnerabilities
        .filter((vulnerability) => typeof vulnerability.id === 'string')
        .map((vulnerability) => ({
          id: vulnerability.id!,
          severity: severityFor(vulnerability as Record<string, unknown>),
        }));
    }),
    partial,
  };
}

export async function lookupAdvisories(
  dependencies: ParsedDependency[],
  options: { force?: boolean } = {},
): Promise<AdvisoryLookup> {
  const advisories = new Map<string, Advisory[]>();
  const missing: ParsedDependency[] = [];

  for (const dependency of dependencies) {
    const key = keyFor(dependency);
    if (!options.force) {
      try {
        const cached = await cacheGet<Advisory[]>(cacheKeys.dependencyOsv(
          dependency.ecosystem,
          dependency.name,
          dependency.version,
        ));
        if (cached) {
          advisories.set(key, cached);
          continue;
        }
      } catch {
        // Redis is optional for OSV lookups.
      }
    }
    missing.push(dependency);
  }

  let partial = false;
  for (let start = 0; start < missing.length; start += BATCH_SIZE) {
    const batch = missing.slice(start, start + BATCH_SIZE);
    try {
      const result = await queryBatch(batch);
      partial ||= result.partial;
      batch.forEach((dependency, index) => {
        const found = result.results[index] ?? [];
        advisories.set(keyFor(dependency), found);
        void cacheSet(
          cacheKeys.dependencyOsv(
            dependency.ecosystem,
            dependency.name,
            dependency.version,
          ),
          found,
          CACHE_TTL_SECONDS,
        ).catch(() => undefined);
      });
    } catch (err) {
      partial = true;
      logger.warn(`OSV lookup failed: ${(err as Error).message}`);
      for (const dependency of batch) {
        advisories.set(keyFor(dependency), []);
      }
    }
  }

  return { advisories, partial };
}

export function maxSeverity(advisories: Advisory[]): DependencySeverity | null {
  const order: DependencySeverity[] = ['low', 'moderate', 'high', 'critical'];
  let result: DependencySeverity | null = null;
  for (const advisory of advisories) {
    if (!advisory.severity) continue;
    if (
      result === null ||
      order.indexOf(advisory.severity) > order.indexOf(result)
    ) {
      result = advisory.severity;
    }
  }
  return result;
}
