/**
 * Types shared between the server and the frontend.
 *
 * This is the API contract. Both sides import from here:
 *   - Server: imported by services that build the JSON responses
 *   - Frontend: imported by API clients and UI components that render them
 *
 * Keep this file dependency-free — no imports from server/ or src/.
 * Types only, no runtime values.
 */

export type ToolCategory =
  | 'testing'
  | 'linting'
  | 'ci_cd'
  | 'coverage'
  | 'docs'
  | 'dependencies';

export type ToolMetric = {
  name: string;
  category: ToolCategory;
  detected: boolean;
  relevant: boolean;
  tracked: boolean;
  adoptionRate: number;
  contributorCount: number;
  contributorsUsing: number;
  countsTowardScore: boolean;
  evidence: Record<string, unknown> | null;
};

export type RepoMetrics = {
  repoId: string;
  repoFullName: string;
  scanId: string | null;
  scanCompletedAt: string | null;
  adoptionScore: number;
  coverage: number;
  adoption: number;
  languages: string[];
  toolsChecked: number;
  toolsRelevant: number;
  toolsTracked: number;
  toolsDetected: number;
  tools: ToolMetric[];
};

export type ScanStatus = 'pending' | 'running' | 'complete' | 'failed';

export type ScanSummary = {
  id: string;
  repoId: string;
  status: ScanStatus;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  summary: Record<string, unknown> | null;
  createdAt: string;
};

export type TrackedRepository = {
  id: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  stars: number;
  forks: number;
  contributorCount: number;
  createdAt: string;
};

export type TrackedToolRow = {
  toolName: string;
  enabled: boolean;
  detected: boolean;
  relevant: boolean;
  category: string;
};

export type AuthUser = {
  id: string;
  githubId: number;
  username: string;
  email: string | null;
  avatarUrl: string | null;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

export type InsightAvailability = {
  available: boolean;
  scanId: string | null;
  completedAt: string | null;
  reason?: string;
};

export type RepoTreeNode = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  fileCount?: number;
  lastModified: string | null;
  children?: RepoTreeNode[];
};

export type FileTypeStat = {
  extension: string;
  count: number;
  sizeBytes: number;
};

export type RepoStructure = {
  fileCount: number;
  directoryCount: number;
  totalSize: number;
  truncated: boolean;
  fileTypes: FileTypeStat[];
  tree: RepoTreeNode[];
};

export type RepoStructureResponse = InsightAvailability & {
  structure?: RepoStructure;
};

export type ContributorActivity = {
  login: string;
  commits: number;
};

export type CommitQuality = {
  totalCommits: number;
  conventionalPercent: number;
  bodyPercent: number;
  averageMessageLength: number;
  averageBodyLength: number;
  mostCommonType: string | null;
  examples: string[];
  messageLengthBuckets: Array<{ label: string; count: number }>;
};

export type CommitActivity = {
  range: 90 | 180 | 365;
  daily: Record<string, number>;
  weekly: Array<{ weekStart: string; count: number }>;
  topContributors: ContributorActivity[];
  weekday: number[];
  hourOfDay: number[];
  quality: CommitQuality;
};

export type CommitActivityResponse = InsightAvailability & {
  activity?: CommitActivity;
};

export type ContributorShare = {
  login: string;
  commits: number;
  share: number;
};

export type ContributorConcentration = {
  totalCommits: number;
  contributorCount: number;
  top1Share: number;
  top3Share: number;
  top10Share: number;
  gini: number;
  risk: 'green' | 'yellow' | 'red';
  topContributors: ContributorShare[];
};

export type ContributorConcentrationResponse = InsightAvailability & {
  concentration?: ContributorConcentration;
};

export type WorkflowHealth = {
  name: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  averageDurationSeconds: number | null;
};

export type CiFailure = {
  runId: number;
  workflowName: string;
  branch: string | null;
  actor: string | null;
  conclusion: string | null;
  completedAt: string | null;
  url: string | null;
};

export type CiHealth = {
  successRate: number | null;
  totalRuns: number;
  workflows: WorkflowHealth[];
  recentFailures: CiFailure[];
  partial: boolean;
  fetchedAt: string | null;
};

export type CiHealthResponse = InsightAvailability & {
  ci?: CiHealth;
};

export type DependencyEcosystem =
  | 'npm'
  | 'pypi'
  | 'go'
  | 'rubygems'
  | 'packagist';

export type DependencySeverity =
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical';

export type DependencySummary = {
  total: number;
  checked: number;
  outdated: number;
  advisoryCount: number;
  severity: Record<DependencySeverity, number>;
  partial: boolean;
  checkedAt: string | null;
};

export type DependencyRow = {
  ecosystem: DependencyEcosystem;
  packageName: string;
  currentVersion: string;
  latestVersion: string | null;
  outdated: boolean;
  advisoryCount: number;
  maxSeverity: DependencySeverity | null;
  registryUrl: string;
};

export type DependenciesResponse = InsightAvailability & {
  summary?: DependencySummary;
  rows: DependencyRow[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    hasMore: boolean;
  };
};

export type DependencyRefreshResponse = {
  queued: boolean;
  scanId: string;
};

export type RepoHealthComponentKey =
  | 'activity'
  | 'dependencies'
  | 'ci'
  | 'concentration'
  | 'commitQuality';

export type RepoHealthComponent = {
  key: RepoHealthComponentKey;
  label: string;
  score: number;
  weight: number;
  available: boolean;
};

export type RepoHealth = {
  score: number | null;
  components: RepoHealthComponent[];
};

export type OverviewCards = {
  concentration?: ContributorConcentration;
  ci?: {
    available: boolean;
    successRate: number | null;
    worstWorkflow: string | null;
  };
  dependencies?: {
    total: number;
    outdated: number;
    advisoryCount: number;
    partial: boolean;
  };
  activity?: {
    last90Commits: number;
    sparkline: Array<{ date: string; count: number }>;
  };
  commitQuality?: CommitQuality;
};

export type OverviewResponse = InsightAvailability & {
  health?: RepoHealth;
  cards?: OverviewCards;
};