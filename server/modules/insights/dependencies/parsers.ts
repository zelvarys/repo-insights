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

export const ANY_VERSION = '*';

const DIFFICULT_VERSIONS =
  /^(workspace|link|file|git|https?|npm|catalog|portal):/i;

function cleanVersion(value: string): string | null {
  const version = value
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^v/, '');
  if (!version || DIFFICULT_VERSIONS.test(version)) return null;
  return version;
}

function declaredVersion(value: string): string | null {
  const raw = value.trim().replace(/^["']|["']$/g, '');
  if (
    !raw ||
    DIFFICULT_VERSIONS.test(raw) ||
    raw === '*' ||
    raw.toLowerCase() === 'latest' ||
    raw.includes('://')
  ) {
    return null;
  }
  const match = /\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?/.exec(raw);
  return match ? cleanVersion(match[0]) : null;
}

function manifestVersion(value: string): string | null {
  const raw = value.trim().replace(/^["']|["']$/g, '');
  if (!raw) return null;
  if (
    DIFFICULT_VERSIONS.test(raw) ||
    raw.includes('://') ||
    /@\s*(git\+|https?|file|link|workspace)/i.test(raw)
  ) {
    return null;
  }
  return declaredVersion(raw) ?? ANY_VERSION;
}

function parseRequirement(value: string): ParsedDependency | null {
  const cleaned = value.replace(/#.*$/, '').trim();
  if (!cleaned || cleaned.startsWith('-')) return null;
  const match = /^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(.*)$/.exec(cleaned);
  if (!match) return null;
  const spec = match[2]!.split(';')[0]!.trim();
  const version = spec ? manifestVersion(spec) : ANY_VERSION;
  if (!version) return null;
  return { ecosystem: 'pypi', name: match[1]!, version };
}

function parsePackageJson(content: string): ParsedDependency[] {
  const data = JSON.parse(content) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const result: ParsedDependency[] = [];
  for (const section of [
    data.dependencies,
    data.devDependencies,
    data.optionalDependencies,
  ]) {
    for (const [name, rawVersion] of Object.entries(section ?? {})) {
      const version = manifestVersion(rawVersion);
      if (version) result.push({ ecosystem: 'npm', name, version });
    }
  }
  return result;
}

function parseRequirements(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  const logical = content.replace(/\\\r?\n/g, ' ');
  for (const line of logical.split(/\r?\n/)) {
    const dependency = parseRequirement(line);
    if (dependency) result.push(dependency);
  }
  return result;
}

function parsePyproject(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  const lines = content.split(/\r?\n/);
  const dependenciesStart = lines.findIndex((line) =>
    /^\s*dependencies\s*=\s*\[/.test(line),
  );
  if (dependenciesStart !== -1) {
    for (let index = dependenciesStart; index < lines.length; index += 1) {
      const line = lines[index]!;
      const itemText =
        index === dependenciesStart ? line.slice(line.indexOf('[') + 1) : line;
      if (/^\s*\]/.test(itemText)) break;
      for (const item of itemText.matchAll(/["']([^"']+)["']/g)) {
        const dependency = parseRequirement(item[1]!);
        if (dependency) result.push(dependency);
      }
    }
  }

  let inPoetry = false;
  for (const line of lines) {
    if (/^\s*\[tool\.poetry.*dependencies\]\s*$/.test(line)) {
      inPoetry = true;
      continue;
    }
    if (/^\s*\[/.test(line)) {
      inPoetry = false;
      continue;
    }
    if (!inPoetry) continue;
    const match =
      /^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{[^}]*version\s*=\s*["']([^"']+)["'][^}]*\})/.exec(
        line,
      );
    if (!match || match[1]!.toLowerCase() === 'python') continue;
    const rawVersion = match[2] ?? match[3] ?? match[4] ?? '';
    const version = rawVersion.trim()
      ? manifestVersion(rawVersion)
      : ANY_VERSION;
    if (version) result.push({ ecosystem: 'pypi', name: match[1]!, version });
  }
  return result;
}

function parseSetupCfg(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  let inRequirements = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*install_requires\s*=\s*$/.test(line)) {
      inRequirements = true;
      continue;
    }
    if (inRequirements && /^\S/.test(line)) break;
    if (!inRequirements) continue;
    const dependency = parseRequirement(line);
    if (dependency) result.push(dependency);
  }
  return result;
}

function parseSetupPy(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  const match = /install_requires\s*=\s*\[([\s\S]*?)\]/.exec(content);
  if (!match) return result;
  for (const item of match[1]!.matchAll(/["']([^"']+)["']/g)) {
    const dependency = parseRequirement(item[1]!);
    if (dependency) result.push(dependency);
  }
  return result;
}

function parsePipfile(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  let inPackages = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*\[(?:dev-)?packages\]\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (/^\s*\[/.test(line)) {
      inPackages = false;
      continue;
    }
    if (!inPackages) continue;
    const match =
      /^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{[^}]*version\s*=\s*["']([^"']+)["'][^}]*\})/.exec(
        line,
      );
    if (!match) continue;
    const rawVersion = match[2] ?? match[3] ?? match[4] ?? '';
    const version = rawVersion.trim()
      ? manifestVersion(rawVersion)
      : ANY_VERSION;
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

function parseGemfile(content: string): ParsedDependency[] {
  const result: ParsedDependency[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (/\b(?:git|path|github):/.test(line)) continue;
    const match = /^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/.exec(
      line,
    );
    if (!match) continue;
    const version = match[2] ? manifestVersion(match[2]) : ANY_VERSION;
    if (version) {
      result.push({ ecosystem: 'rubygems', name: match[1]!, version });
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
    if (name.toLowerCase() === 'php' || name.toLowerCase().startsWith('ext-')) {
      continue;
    }
    const version = manifestVersion(rawVersion);
    if (version) {
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

  const manifestParsers: Array<
    [
      string,
      (content: string) => ParsedDependency[],
      'npm' | 'pypi' | 'go' | 'rubygems' | 'packagist',
    ]
  > = [
    ['package.json', parsePackageJson, 'npm'],
    ['requirements.txt', parseRequirements, 'pypi'],
    ['requirements-dev.txt', parseRequirements, 'pypi'],
    ['dev-requirements.txt', parseRequirements, 'pypi'],
    ['pyproject.toml', parsePyproject, 'pypi'],
    ['setup.cfg', parseSetupCfg, 'pypi'],
    ['setup.py', parseSetupPy, 'pypi'],
    ['Pipfile', parsePipfile, 'pypi'],
    ['go.mod', parseGoMod, 'go'],
    ['Gemfile', parseGemfile, 'rubygems'],
    ['composer.json', parseComposerJson, 'packagist'],
  ];

  for (const [path, parser] of manifestParsers) {
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
    const key = `${dependency.ecosystem}:${dependency.name}`;
    const existing = unique.get(key);
    if (
      !existing ||
      (existing.version === ANY_VERSION && dependency.version !== ANY_VERSION)
    ) {
      unique.set(key, dependency);
    }
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
