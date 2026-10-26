import type { RepoMetrics, ToolMetric } from '../../../shared/types.js';

const COMMIT_PRESENCE_TOOLS = new Set([
  'github-actions',
  'dependabot',
  'renovate',
]);

const JS_TOOLS = new Set(['jest', 'eslint', 'prettier']);
const PYTHON_TOOLS = new Set(['pytest', 'black', 'ruff']);
const GO_TOOLS = new Set(['go-test', 'golangci-lint']);
const PHP_TOOLS = new Set(['phpunit']);

export type DetectedLanguages = {
  js: boolean;
  python: boolean;
  go: boolean;
  php: boolean;
};

export function detectLanguages(input: {
  rootFiles: string[];
  commitFilenames: string[];
  configFileKeys: string[];
}): DetectedLanguages {
  const { rootFiles, commitFilenames, configFileKeys } = input;
  const allFiles = [...rootFiles, ...commitFilenames];
  const configs = new Set(configFileKeys);
  const hasExt = (ext: string) => allFiles.some((f) => f.endsWith(ext));
  const hasConfig = (...paths: string[]) => paths.some((p) => configs.has(p));

  return {
    js:
      hasConfig('package.json') ||
      hasExt('.js') ||
      hasExt('.jsx') ||
      hasExt('.ts') ||
      hasExt('.tsx') ||
      hasExt('.mjs') ||
      hasExt('.cjs'),
    python:
      hasConfig(
        'pyproject.toml',
        'setup.py',
        'setup.cfg',
        'requirements.txt',
        'pytest.ini',
        'tox.ini',
      ) ||
      hasExt('.py'),
    go: hasConfig('go.mod', 'go.sum') || hasExt('.go'),
    php:
      hasConfig(
        'composer.json',
        'composer.lock',
        'phpunit.xml',
        'phpunit.xml.dist',
      ) ||
      hasExt('.php'),
  };
}

export function isToolRelevant(
  toolName: string,
  langs: DetectedLanguages,
): boolean {
  if (JS_TOOLS.has(toolName)) return langs.js;
  if (PYTHON_TOOLS.has(toolName)) return langs.python;
  if (GO_TOOLS.has(toolName)) return langs.go;
  if (PHP_TOOLS.has(toolName)) return langs.php;
  return true;
}

export function languagesToArray(langs: DetectedLanguages): string[] {
  const out: string[] = [];
  if (langs.js) out.push('js');
  if (langs.python) out.push('python');
  if (langs.go) out.push('go');
  if (langs.php) out.push('php');
  return out;
}

type ScoreBase = Pick<
  RepoMetrics,
  'repoId' | 'repoFullName' | 'scanId' | 'scanCompletedAt' | 'languages'
>;

const EMPTY_BASE: ScoreBase = {
  repoId: '',
  repoFullName: '',
  scanId: null,
  scanCompletedAt: null,
  languages: [],
};

export function computeScore(
  tools: ToolMetric[],
  trackedNames: Set<string>,
  base: ScoreBase = EMPTY_BASE,
): RepoMetrics {
  const normalizedTools = tools.map((tool) => ({
    ...tool,
    tracked: trackedNames.has(tool.name),
    countsTowardScore: !COMMIT_PRESENCE_TOOLS.has(tool.name),
  }));

  const trackedTools = normalizedTools.filter((t) => trackedNames.has(t.name));
  const scoringSet =
    trackedTools.length > 0
      ? trackedTools
      : normalizedTools.filter((t) => t.relevant && t.detected);

  const detectedInSet = scoringSet.filter((t) => t.detected);
  const scoredTools = detectedInSet.filter((t) => t.countsTowardScore);

  const coverage =
    scoringSet.length > 0 ? detectedInSet.length / scoringSet.length : 0;
  const adoption =
    scoredTools.length > 0
      ? scoredTools.reduce((sum, t) => sum + t.adoptionRate, 0) /
        scoredTools.length
      : 0;

  const adoptionScore = Math.round(coverage * adoption * 100) / 100;

  return {
    ...base,
    adoptionScore,
    coverage: Math.round(coverage * 10000) / 100,
    adoption: Math.round(adoption * 100) / 100,
    toolsChecked: normalizedTools.length,
    toolsRelevant: normalizedTools.filter((t) => t.relevant).length,
    toolsTracked: scoringSet.length,
    toolsDetected: detectedInSet.length,
    tools: normalizedTools,
  };
}
