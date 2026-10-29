import { cacheGet, cacheSet } from '../../../utils/cache.js';
import { cacheKeys } from '../../../utils/cache.js';
import { logger } from '../../../utils/logger.js';
import type { ParsedDependency } from './parsers.js';

const TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 24 * 60 * 60;

type CachedLatest = { version: string | null };

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'repo-insights',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Registry ${response.status} for ${url}`);
  }
  return response.json();
}

function stripVersion(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/^v/, '')
    : null;
}

async function fetchLatestVersion(
  dependency: ParsedDependency,
): Promise<string | null> {
  const name = dependency.name;
  switch (dependency.ecosystem) {
    case 'npm': {
      const data = (await fetchJson(
        `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
      )) as { version?: string };
      return stripVersion(data.version);
    }
    case 'pypi': {
      const data = (await fetchJson(
        `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
      )) as { info?: { version?: string } };
      return stripVersion(data.info?.version);
    }
    case 'go': {
      const data = (await fetchJson(
        `https://proxy.golang.org/${name}/@latest`,
      )) as { Version?: string };
      return stripVersion(data.Version);
    }
    case 'rubygems': {
      const data = (await fetchJson(
        `https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`,
      )) as { version?: string };
      return stripVersion(data.version);
    }
    case 'packagist': {
      const data = (await fetchJson(
        `https://repo.packagist.org/p2/${name}.json`,
      )) as { packages?: Record<string, Array<{ version?: string }>> };
      const versions = data.packages?.[name.toLowerCase()] ?? [];
      const stable = versions.find(
        (entry) => entry.version && !entry.version.includes('dev'),
      );
      return stripVersion(stable?.version);
    }
  }
}

export async function getLatestVersion(
  dependency: ParsedDependency,
  options: { force?: boolean } = {},
): Promise<string | null> {
  const key = cacheKeys.dependencyRegistry(
    dependency.ecosystem,
    dependency.name,
  );
  if (!options.force) {
    try {
      const cached = await cacheGet<CachedLatest>(key);
      if (cached) return cached.version;
    } catch {
      // Redis is optional for registry lookups.
    }
  }

  try {
    const version = await fetchLatestVersion(dependency);
    try {
      await cacheSet(key, { version }, CACHE_TTL_SECONDS);
    } catch {
      // Ignore cache write failures.
    }
    return version;
  } catch (err) {
    logger.warn(
      `Registry lookup failed for ${dependency.ecosystem}:${dependency.name}: ${(err as Error).message}`,
    );
    return null;
  }
}
