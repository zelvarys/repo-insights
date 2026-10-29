import type { DependencyEcosystem } from '../../../../shared/types.js';

export type ParsedDependency = {
  ecosystem: DependencyEcosystem;
  name: string;
  version: string;
};

export type ParseResult = {
  dependencies: ParsedDependency[];
  partial: boolean;
};

const DIFFICULT_VERSIONS = /^(workspace|link|file|git|https?):/i;

function cleanVersion(value: string): string | null {
  const version = value.trim().replace(/^["']|["']$/g, '').replace(/^v/, '');
  if (!version || DIFFICULT_VERSIONS.test(version)) return null;
  return version;
}

function npmNameFromSelector(selector: string): string | null {
  const first = selector.replace(/^["']|["']$/g, '').split(',')[0]!.trim();
  if (!first || first.startsWith('__metadata')) return null;
  const at = first.lastIndexOf('@');
  if (at <= 0) return null;
  const name = first.slice(0, at);
  return name.startsWith('@') || !name.includes(':') ? name : null;
}

function parsePackageLock(content: string): ParsedDependency[] {
  const data = JSON.parse(content) as {
    packages?: Record<string, { version?: string }>;
    dependencies?: Record<string, { version?: string; dependencies?: unknown }>;
  };
  const result: ParsedDependency[] = [];
  const seen = new Set<string>();

  function add(name: string, rawVersion: string | undefined): void {
    if (!rawVersion) return;
    const version = cleanVersion(rawVersion);
    if (!version) return;
    const key = `${name}@${version}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ ecosystem: 'npm', name, version });
  }

  if (data.packages) {
    for (const [path, entry] of Object.entries(data.packages)) {
      if (!path) continue;
      const marker = 'node_modules/';
      const index = path.lastIndexOf(marker);
      if (index === -1) continue;
      add(path.slice(index + marker.length), entry.version);
    }
  }

  if (result.length === 0 && data.dependencies) {
    function walk(deps: Record<string, { version?: string; dependencies?: unknown }>): void {
      for (const [name, entry] of Object.entries(deps)) {
        add(name, entry.version);
        if (entry.dependencies) {
          walk(entry.dependencies as Record<string, { version?: string; dependencies?: unknown }>);
        }
      }
    }
    walk(data.dependencies);
  }

  return result;
}

function parseYarnLock(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  for (const block of content.split(/\n\s*\n/)) {
    const lines = block.split(/\r?\n/);
    const header = lines[0]?.trim();
    if (!header || header.startsWith('#') || header.startsWith('__metadata')) continue;
    const selector = header.replace(/:$/, '');
    const name = npmNameFromSelector(selector);
    if (!name) continue;
    const versionLine = lines.find((line) => /^\s+version:?/.test(line));
    if (!versionLine) continue;
    const match = /version:?\s+["']?([^"'\s]+)["']?/.exec(versionLine);
    const version = match ? cleanVersion(match[1]!) : null;
    if (version) result.push({ ecosystem: 'npm', name, version });
  }
  return result;
}

function parsePnpmLock(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  let inPackages = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (/^\S/.test(line)) break;
    const keyMatch = /^\s{2}['"]?([^'"]+?)['"]?:\s*$/.exec(line);
    if (!keyMatch) continue;
    let key = keyMatch[1]!.replace(/^\//, '');
    key = key.replace(/\(.*\)$/, '');
    const at = key.lastIndexOf('@');
    if (at <= 0) continue;
    const name = key.slice(0, at);
    const version = cleanVersion(key.slice(at + 1).split('_')[0]!);
    if (version) result.push({ ecosystem: 'npm', name, version });
  }
  return result;
}

function parseRequirements(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  for (const line of content.split(/\r?\n/)) {
    const cleaned = line.replace(/#.*$/, '').trim();
    if (!cleaned || cleaned.startsWith('-')) continue;
    const match = /^([A-Za-z0-9_.-]+)\s*(?:\[[^\]]+\])?\s*==\s*([^\s;]+)/.exec(cleaned);
    if (!match) continue;
    const version = cleanVersion(match[2]!);
    if (version) result.push({ ecosystem: 'pypi', name: match[1]!, version });
  }
  return result;
}

function parsePyproject(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  const quoted = /["']([A-Za-z0-9_.-]+)\s*===\s*([A-Za-z0-9_.+!-]+)["']/g;
  for (const match of content.matchAll(quoted)) {
    const version = cleanVersion(match[2]!);
    if (version) result.push({ ecosystem: 'pypi', name: match[1]!, version });
  }

  let inPoetry = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*\[tool\.poetry\.dependencies\]\s*$/.test(line)) {
      inPoetry = true;
      continue;
    }
    if (/^\s*\[/.test(line)) {
      inPoetry = false;
      continue;
    }
    if (!inPoetry) continue;
    const match = /^\s*([A-Za-z0-9_.-]+)\s*=\s*["']([0-9][^"']*)["']/.exec(line);
    if (!match || match[1]!.toLowerCase() === 'python') continue;
    const version = cleanVersion(match[2]!);
    if (version) result.push({ ecosystem: 'pypi', name: match[1]!, version });
  }
  return result;
}

function parseGoMod(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  let inRequire = false;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('require (')) {
      inRequire = true;
      continue;
    }
    if (inRequire && trimmed === ')') {
      inRequire = false;
      continue;
    }
    const candidate = inRequire ? trimmed : trimmed.replace(/^require\s+/, '');
    if (!inRequire && !trimmed.startsWith('require ')) continue;
    const match = /^([^\s]+)\s+(v[^\s]+)/.exec(candidate);
    if (!match) continue;
    const version = cleanVersion(match[2]!);
    if (version) result.push({ ecosystem: 'go', name: match[1]!, version });
  }
  return result;
}

function parseGoSum(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  for (const line of content.split(/\r?\n/)) {
    const [name, rawVersion] = line.trim().split(/\s+/);
    if (!name || !rawVersion || rawVersion.endsWith('/go.mod')) continue;
    const version = cleanVersion(rawVersion);
    if (version) result.push({ ecosystem: 'go', name, version });
  }
  return result;
}

function parseGemfileLock(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  let inGemSpecs = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^GEM\s*$/.test(line)) {
      inGemSpecs = false;
      continue;
    }
    if (/^\s{2}specs:\s*$/.test(line)) {
      inGemSpecs = true;
      continue;
    }
    if (/^\S/.test(line)) {
      inGemSpecs = false;
      continue;
    }
    if (!inGemSpecs) continue;
    const match = /^\s{4}([A-Za-z0-9_.-]+)\s+\(([^)]+)\)/.exec(line);
    if (!match) continue;
    const version = cleanVersion(match[2]!);
    if (version) result.push({ ecosystem: 'rubygems', name: match[1]!, version });
  }
  return result;
}

function parseGemfile(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*gem\s+["']([^"']+)["']\s*,\s*["']([0-9][^"']*)["']/.exec(line);
    if (!match) continue;
    const version = cleanVersion(match[2]!);
    if (version && /^\d/.test(version)) {
      result.push({ ecosystem: 'rubygems', name: match[1]!, version });
    }
  }
  return result;
}

function parseComposerLock(content: string): ParsedDependency[] {
  const data = JSON.parse(content) as {
    packages?: Array<{ name?: string; version?: string }>;
    'packages-dev'?: Array<{ name?: string; version?: string }>;
  };
  const result: ParsedDependency[] = [];
  for (const entry of [...(data.packages ?? []), ...(data['packages-dev'] ?? [])]) {
    if (!entry.name || !entry.version) continue;
    const version = cleanVersion(entry.version);
    if (version) {
      result.push({ ecosystem: 'packagist', name: entry.name, version });
    }
  }
  return result;
}

function parseComposerJson(content: string): ParsedDependency[] {
  const data = JSON.parse(content) as {
    require?: Record<string, string>;
    'require-dev'?: Record<string, string>;
  };
  const result: ParsedDependency[] = [];
  for (const [name, rawVersion] of Object.entries({
    ...(data.require ?? {}),
    ...(data['require-dev'] ?? {}),
  })) {
    if (name.toLowerCase() === 'php') continue;
    const version = cleanVersion(rawVersion);
    if (version && /^\d/.test(version)) {
      result.push({ ecosystem: 'packagist', name, version });
    }
  }
  return result;
}

export function parseDependencies(
  configFiles: Record<string, string>,
): ParseResult {
  const dependencies: ParsedDependency[] = [];
  let partial = false;

  const parsers: Array<[string, (content: string) => ParsedDependency[]]> = [
    ['package-lock.json', parsePackageLock],
    ['yarn.lock', parseYarnLock],
    ['pnpm-lock.yaml', parsePnpmLock],
    ['requirements.txt', parseRequirements],
    ['pyproject.toml', parsePyproject],
    ['go.mod', parseGoMod],
    ['go.sum', parseGoSum],
    ['Gemfile.lock', parseGemfileLock],
    ['Gemfile', parseGemfile],
    ['composer.lock', parseComposerLock],
    ['composer.json', parseComposerJson],
  ];

  for (const [path, parser] of parsers) {
    const content = configFiles[path];
    if (content === undefined) continue;
    try {
      dependencies.push(...parser(content));
    } catch {
      partial = true;
    }
  }

  const unique = new Map<string, ParsedDependency>();
  for (const dependency of dependencies) {
    const key = `${dependency.ecosystem}:${dependency.name}@${dependency.version}`;
    if (!unique.has(key)) unique.set(key, dependency);
  }

  return {
    dependencies: [...unique.values()].sort(
      (a, b) =>
        a.ecosystem.localeCompare(b.ecosystem) ||
        a.name.localeCompare(b.name) ||
        a.version.localeCompare(b.version),
    ),
    partial,
  };
}

export function registryUrl(dependency: ParsedDependency): string {
  const name = encodeURIComponent(dependency.name);
  switch (dependency.ecosystem) {
    case 'npm':
      return `https://www.npmjs.com/package/${dependency.name}`;
    case 'pypi':
      return `https://pypi.org/project/${name}/`;
    case 'go':
      return `https://pkg.go.dev/${dependency.name}`;
    case 'rubygems':
      return `https://rubygems.org/gems/${name}`;
    case 'packagist':
      return `https://packagist.org/packages/${dependency.name}`;
  }
}
