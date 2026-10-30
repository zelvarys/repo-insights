import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseDependencies,
  registryUrl,
} from '../../server/modules/insights/dependencies/parsers.js';
import {
  compareVersions,
  isOutdated,
} from '../../server/modules/insights/dependencies/semver.js';
import {
  lookupAdvisories,
  maxSeverity,
} from '../../server/modules/insights/dependencies/osv.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dependency parsers', () => {
  it('parses npm package-lock v3 and drops the root package', () => {
    const result = parseDependencies({
      'package-lock.json': JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { name: 'app' },
          'node_modules/lodash': { version: '4.17.21' },
          'node_modules/@types/node': { version: '20.0.0' },
          'node_modules/a/node_modules/b': { version: '1.2.3' },
        },
      }),
    });
    expect(result.partial).toBe(false);
    expect(result.dependencies).toEqual([
      { ecosystem: 'npm', name: '@types/node', version: '20.0.0' },
      { ecosystem: 'npm', name: 'b', version: '1.2.3' },
      { ecosystem: 'npm', name: 'lodash', version: '4.17.21' },
    ]);
  });

  it('parses yarn.lock selectors and scoped packages', () => {
    const result = parseDependencies({
      'yarn.lock': [
        '# yarn lockfile v1',
        '',
        '@types/node@^20.0.0:',
        '  version "20.1.0"',
        '',
        'lodash@^4.0.0, lodash@^4.17.0:',
        '  version "4.17.21"',
      ].join('\n'),
    });
    expect(result.dependencies).toEqual([
      { ecosystem: 'npm', name: '@types/node', version: '20.1.0' },
      { ecosystem: 'npm', name: 'lodash', version: '4.17.21' },
    ]);
  });

  it('parses pnpm lock packages', () => {
    const result = parseDependencies({
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'packages:',
        '  lodash@4.17.21:',
        '    resolution: {integrity: sha512-x}',
        '  /@scope/pkg@1.2.3:',
        '    resolution: {integrity: sha512-y}',
      ].join('\n'),
    });
    expect(result.dependencies).toEqual([
      { ecosystem: 'npm', name: '@scope/pkg', version: '1.2.3' },
      { ecosystem: 'npm', name: 'lodash', version: '4.17.21' },
    ]);
  });

  it('parses pinned Python requirements and Poetry versions', () => {
    const result = parseDependencies({
      'requirements.txt': [
        '# comment',
        '-r other.txt',
        'requests==2.31.0',
        'django[argon2]==4.2.1 ; python_version >= "3.7"',
        'unpinned>=1.0',
        'git+https://example.com/repo.git#egg=thing',
      ].join('\n'),
      'pyproject.toml': [
        '[tool.poetry.dependencies]',
        'python = "^3.11"',
        'click = "8.1.7"',
        '[tool.poetry.group.dev.dependencies]',
        'pytest = "7.4.0"',
      ].join('\n'),
    });
    expect(result.dependencies).toEqual([
      { ecosystem: 'pypi', name: 'click', version: '8.1.7' },
      { ecosystem: 'pypi', name: 'django', version: '4.2.1' },
      { ecosystem: 'pypi', name: 'requests', version: '2.31.0' },
      { ecosystem: 'pypi', name: 'unpinned', version: '1.0' },
    ]);
  });

  it('prefers direct package manifests over transitive lockfile entries', () => {
    const result = parseDependencies({
      'package.json': JSON.stringify({
        dependencies: {
          lodash: '^4.17.21',
          react: '~18.2.0',
          linked: 'file:../linked',
        },
        devDependencies: { vitest: '>=2.0.0 <3' },
      }),
      'package-lock.json': JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/lodash': { version: '4.17.21' },
          'node_modules/transitive': { version: '1.0.0' },
        },
      }),
    });
    expect(result.dependencies).toEqual([
      { ecosystem: 'npm', name: 'lodash', version: '4.17.21' },
      { ecosystem: 'npm', name: 'react', version: '18.2.0' },
      { ecosystem: 'npm', name: 'vitest', version: '2.0.0' },
    ]);
  });

  it('parses PEP 621 project dependencies from pyproject.toml', () => {
    const result = parseDependencies({
      'pyproject.toml': [
        '[project]',
        'dependencies = [',
        '  "requests>=2.31.0",',
        '  "django[argon2]~=4.2.1",',
        '  "unpinned",',
        ']',
      ].join('\n'),
    });
    expect(result.dependencies).toEqual([
      { ecosystem: 'pypi', name: 'django', version: '4.2.1' },
      { ecosystem: 'pypi', name: 'requests', version: '2.31.0' },
    ]);
  });

  it('parses Go modules, Gemfile.lock, and Composer lock', () => {
    const result = parseDependencies({
      'go.mod': [
        'module example.com/app',
        'require github.com/gin-gonic/gin v1.9.1',
        'require (',
        '\tgithub.com/stretchr/testify v1.8.4',
        ')',
      ].join('\n'),
      'Gemfile.lock': [
        'GEM',
        '  remote: https://rubygems.org/',
        '  specs:',
        '    rails (7.0.8)',
        '      actionpack (= 7.0.8)',
        '',
        'PLATFORMS',
        '  ruby',
      ].join('\n'),
      'composer.lock': JSON.stringify({
        packages: [{ name: 'monolog/monolog', version: '3.5.0' }],
        'packages-dev': [{ name: 'phpunit/phpunit', version: '10.4.0' }],
      }),
    });
    expect(result.dependencies).toEqual([
      { ecosystem: 'go', name: 'github.com/gin-gonic/gin', version: '1.9.1' },
      {
        ecosystem: 'go',
        name: 'github.com/stretchr/testify',
        version: '1.8.4',
      },
      { ecosystem: 'packagist', name: 'monolog/monolog', version: '3.5.0' },
      { ecosystem: 'packagist', name: 'phpunit/phpunit', version: '10.4.0' },
      { ecosystem: 'rubygems', name: 'rails', version: '7.0.8' },
    ]);
  });

  it('parses go.sum checksums and ignores go.mod hash entries', () => {
    const result = parseDependencies({
      'go.sum': [
        'github.com/gin-gonic/gin v1.9.1 h1:abc=',
        'github.com/gin-gonic/gin v1.9.1/go.mod h1:def=',
        'github.com/stretchr/testify v1.8.4 h1:ghi=',
        'github.com/stretchr/testify v1.8.4/go.mod h1:jkl=',
      ].join('\n'),
    });
    expect(result.dependencies).toEqual([
      { ecosystem: 'go', name: 'github.com/gin-gonic/gin', version: '1.9.1' },
      {
        ecosystem: 'go',
        name: 'github.com/stretchr/testify',
        version: '1.8.4',
      },
    ]);
  });

  it('deduplicates identical dependencies and flags malformed lockfiles', () => {
    const result = parseDependencies({
      'package-lock.json': '{not json',
      'requirements.txt': 'requests==2.31.0\nrequests==2.31.0\n',
    });
    expect(result.partial).toBe(true);
    expect(result.dependencies).toEqual([
      { ecosystem: 'pypi', name: 'requests', version: '2.31.0' },
    ]);
  });

  it('builds human registry URLs', () => {
    expect(
      registryUrl({ ecosystem: 'npm', name: '@scope/pkg', version: '1.0.0' }),
    ).toBe('https://www.npmjs.com/package/@scope/pkg');
    expect(
      registryUrl({ ecosystem: 'pypi', name: 'requests', version: '1.0.0' }),
    ).toBe('https://pypi.org/project/requests/');
    expect(
      registryUrl({
        ecosystem: 'go',
        name: 'github.com/a/b',
        version: '1.0.0',
      }),
    ).toBe('https://pkg.go.dev/github.com/a/b');
    expect(
      registryUrl({ ecosystem: 'rubygems', name: 'rails', version: '1.0.0' }),
    ).toBe('https://rubygems.org/gems/rails');
    expect(
      registryUrl({ ecosystem: 'packagist', name: 'a/b', version: '1.0.0' }),
    ).toBe('https://packagist.org/packages/a/b');
  });
});

describe('semver helpers', () => {
  it('compares versions including prereleases', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(compareVersions('v2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBeGreaterThan(0);
    expect(compareVersions('not-a-version', '1.0.0')).toBeNull();
  });

  it('marks outdated only when a valid newer latest exists', () => {
    expect(isOutdated('1.0.0', '1.0.1')).toBe(true);
    expect(isOutdated('1.0.1', '1.0.1')).toBe(false);
    expect(isOutdated('1.0.1', '1.0.0')).toBe(false);
    expect(isOutdated('1.0.1', null)).toBe(false);
    expect(isOutdated('workspace:*', '1.0.0')).toBe(false);
  });
});

describe('OSV advisories', () => {
  it('returns the highest severity', () => {
    expect(maxSeverity([])).toBeNull();
    expect(
      maxSeverity([
        { id: 'A', severity: 'low' },
        { id: 'B', severity: 'critical' },
        { id: 'C', severity: 'moderate' },
      ]),
    ).toBe('critical');
  });

  it('maps querybatch results and caches them', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            vulns: [
              { id: 'OSV-1', database_specific: { severity: 'HIGH' } },
              { id: 'OSV-2', database_specific: { severity: 'medium' } },
            ],
          },
          {},
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await lookupAdvisories(
      [
        { ecosystem: 'npm', name: 'unique-osv-pkg', version: '1.0.0' },
        { ecosystem: 'npm', name: 'unique-osv-pkg-empty', version: '1.0.0' },
      ],
      { force: true },
    );
    expect(result.partial).toBe(false);
    expect(result.advisories.get('npm:unique-osv-pkg@1.0.0')).toEqual([
      { id: 'OSV-1', severity: 'high' },
      { id: 'OSV-2', severity: 'moderate' },
    ]);
    expect(result.advisories.get('npm:unique-osv-pkg-empty@1.0.0')).toEqual([]);
  });

  it('marks lookups partial when OSV fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    const result = await lookupAdvisories(
      [{ ecosystem: 'pypi', name: 'unique-osv-fail', version: '1.0.0' }],
      { force: true },
    );
    expect(result.partial).toBe(true);
    expect(result.advisories.get('pypi:unique-osv-fail@1.0.0')).toEqual([]);
  });
});
