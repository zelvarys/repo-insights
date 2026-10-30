import type { GitHubUser, GitHubEmail } from './github.types.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

const API = 'https://api.github.com';
const GRAPHQL = 'https://api.github.com/graphql';

export class GitHubApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof GitHubApiError && err.status === 404;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(env.GITHUB_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    ) {
      throw new GitHubApiError(
        `GitHub API timeout after ${env.GITHUB_FETCH_TIMEOUT_MS}ms: ${label}`,
        504,
      );
    }
    throw err;
  }
}

async function ghFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetchWithTimeout(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'repo-insights',
      ...(init.headers ?? {}),
    },
  }, path);
  if (!res.ok) {
    const body = await res.text();
    throw new GitHubApiError(
      `GitHub API ${res.status} on ${path}: ${body.slice(0, 200)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

async function ghGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<T> {
  const res = await fetchWithTimeout(GRAPHQL, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'repo-insights',
    },
    body: JSON.stringify({ query, variables }),
  }, 'graphql');
  if (!res.ok) {
    const body = await res.text();
    throw new GitHubApiError(
      `GitHub GraphQL ${res.status}: ${body.slice(0, 200)}`,
      res.status,
    );
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors && json.errors.length > 0) {
    throw new GitHubApiError(
      `GitHub GraphQL error: ${json.errors[0]!.message}`,
      502,
    );
  }
  if (!json.data) throw new GitHubApiError('GitHub GraphQL returned no data', 502);
  return json.data;
}

// ─── Phase 2: auth ──────────────────────────────────────────────────────

export async function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  return ghFetch<GitHubUser>('/user', token);
}

export async function getPrimaryEmail(token: string): Promise<string | null> {
  try {
    const emails = await ghFetch<GitHubEmail[]>('/user/emails', token);
    const primary = emails.find((e) => e.primary && e.verified);
    return primary?.email ?? emails[0]?.email ?? null;
  } catch (err) {
    if (isNotFound(err)) return null;
    logger.warn(`GitHub primary email lookup failed: ${(err as Error).message}`);
    throw err;
  }
}

// ─── Phase 3: repositories ──────────────────────────────────────────────

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
};

type ContributedRepository = {
  databaseId: number | null;
  name: string;
  nameWithOwner: string; // "owner/name"
  owner: { login: string };
  isPrivate: boolean;
  defaultBranchRef: { name: string } | null;
  stargazerCount: number;
  forkCount: number;
};

type ContributedRepoNode = {
  repository: ContributedRepository;
};

type CommitContributionsQueryResult = {
  user: {
    contributionsCollection: {
      commitContributionsByRepository: ContributedRepoNode[];
    } | null;
  } | null;
};

type MergedPullRequestsQueryResult = {
  search: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<ContributedRepoNode | null>;
  };
};

const CONTRIBUTED_REPOSITORY_FRAGMENT = `
  fragment ContributedRepository on Repository {
    databaseId
    name
    nameWithOwner
    owner { login }
    isPrivate
    defaultBranchRef { name }
    stargazerCount
    forkCount
  }
`;

const COMMIT_CONTRIBUTIONS_QUERY = `
  ${CONTRIBUTED_REPOSITORY_FRAGMENT}

  query CommitContributedRepos($login: String!) {
    user(login: $login) {
      contributionsCollection {
        commitContributionsByRepository(maxRepositories: 100) {
          repository { ...ContributedRepository }
        }
      }
    }
  }
`;

const MERGED_PULL_REQUESTS_QUERY = `
  ${CONTRIBUTED_REPOSITORY_FRAGMENT}

  query MergedPullRequests($q: String!, $after: String) {
    search(query: $q, type: ISSUE, first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          repository { ...ContributedRepository }
        }
      }
    }
  }
`;

const CONTRIBUTION_WINDOW_DAYS = 365;
const MAX_CONTRIBUTED_REPOS = 100;
const MAX_SEARCH_PAGES = 10;

function contributionCutoffDate(now = Date.now()): string {
  return new Date(now - CONTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function toGitHubRepo(repo: ContributedRepository): GitHubRepo | null {
  if (repo.databaseId === null) return null;
  return {
    id: repo.databaseId,
    name: repo.name,
    full_name: repo.nameWithOwner,
    owner: { login: repo.owner.login },
    private: repo.isPrivate,
    default_branch: repo.defaultBranchRef?.name ?? 'main',
    stargazers_count: repo.stargazerCount,
    forks_count: repo.forkCount,
  };
}

function addContributedRepo(
  repos: Map<string, GitHubRepo>,
  repo: ContributedRepository,
): void {
  const mapped = toGitHubRepo(repo);
  if (mapped && !repos.has(mapped.full_name)) {
    repos.set(mapped.full_name, mapped);
  }
}

/**
 * Fetch repos where the user authored a pull request merged in the last 12
 * months. The grouped contributions field does not expose merge state, so this
 * uses the search API with `is:merged`.
 */
async function fetchMergedPullRequestRepos(
  token: string,
  userLogin: string,
): Promise<GitHubRepo[]> {
  const repos = new Map<string, GitHubRepo>();
  const query = `author:${userLogin} type:pr is:merged merged:>=${contributionCutoffDate()}`;
  let after: string | null = null;

  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const data: MergedPullRequestsQueryResult =
      await ghGraphql<MergedPullRequestsQueryResult>(
        MERGED_PULL_REQUESTS_QUERY,
        { q: query, after },
        token,
      );

    for (const node of data.search.nodes) {
      if (node) addContributedRepo(repos, node.repository);
    }

    if (repos.size >= MAX_CONTRIBUTED_REPOS) break;
    if (!data.search.pageInfo.hasNextPage) break;

    after = data.search.pageInfo.endCursor;
    if (!after) break;
    if (page === MAX_SEARCH_PAGES - 1) {
      logger.warn(
        `GitHub merged PR search reached the ${MAX_SEARCH_PAGES}-page cap; later contributions were not fetched`,
      );
    }
  }

  return [...repos.values()];
}

/**
 * Fetch repos the user committed to or had a pull request merged in over the
 * last 12 months. Contributions include repositories the user does not own,
 * which may not appear in `/user/repos`.
 */
async function fetchContributedRepos(
  token: string,
  userLogin: string,
): Promise<GitHubRepo[]> {
  try {
    const [commits, mergedPullRequests] = await Promise.all([
      ghGraphql<CommitContributionsQueryResult>(
        COMMIT_CONTRIBUTIONS_QUERY,
        { login: userLogin },
        token,
      ),
      fetchMergedPullRequestRepos(token, userLogin),
    ]);

    const repos = new Map<string, GitHubRepo>();
    const commitNodes =
      commits.user?.contributionsCollection?.commitContributionsByRepository ?? [];
    for (const node of commitNodes) {
      addContributedRepo(repos, node.repository);
    }
    for (const repo of mergedPullRequests) {
      if (!repos.has(repo.full_name)) repos.set(repo.full_name, repo);
    }

    return [...repos.values()];
  } catch (err) {
    logger.warn(`GitHub contribution lookup failed: ${(err as Error).message}`);
    throw err;
  }
}

/**
 * Returns repos the user owns, can access, or has contributed to in the last
 * 12 months.
 *
 * - Owned repos: always kept.
 * - Collaborator/org repos: kept only when they appear in the user's commit
 *   or merged pull-request contribution sets.
 * - External repos: included when the user committed to or had a pull request
 *   merged in them, even if `/user/repos` does not list them.
 *
 * This replaces the previous N+1 REST loop (one /commits call per org repo).
 */
const MAX_REPO_PAGES = 10;

export function shouldFetchNextRepoPage(
  rawPageSize: number,
  currentPage: number,
  maxPages = MAX_REPO_PAGES,
  perPage = 100,
): boolean {
  return rawPageSize === perPage && currentPage < maxPages;
}

export async function listAuthenticatedUserRepos(
  token: string,
  userLogin: string,
  page = 1,
  perPage = 100,
): Promise<GitHubRepo[]> {
  const contributed = await fetchContributedRepos(token, userLogin);
  const contributedNames = new Set(contributed.map((repo) => repo.full_name));
  const listed: GitHubRepo[] = [];
  const seen = new Set<string>();

  for (let currentPage = page; currentPage <= MAX_REPO_PAGES; currentPage++) {
    const raw = await ghFetch<GitHubRepo[]>(
      `/user/repos?per_page=${perPage}&page=${currentPage}&sort=updated&affiliation=owner,collaborator,organization_member`,
      token,
    );

    for (const repo of raw) {
      if (repo.owner.login !== userLogin && !contributedNames.has(repo.full_name)) {
        continue;
      }
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      listed.push(repo);
    }

    if (!shouldFetchNextRepoPage(raw.length, currentPage, MAX_REPO_PAGES, perPage)) {
      break;
    }
    if (currentPage === MAX_REPO_PAGES) {
      logger.warn(
        `GitHub repo listing reached the ${MAX_REPO_PAGES}-page cap; later repositories were not fetched`,
      );
    }
  }

  // Keep contributed repos that `/user/repos` does not return (for example a
  // repository owned by someone else where the user only merged a PR) at the
  // front so they are visible on the first page of results.
  const external = contributed.filter((repo) => !seen.has(repo.full_name));
  return [...external, ...listed];
}

export async function getRepo(
  token: string,
  owner: string,
  repo: string,
): Promise<GitHubRepo> {
  return ghFetch<GitHubRepo>(`/repos/${owner}/${repo}`, token);
}

export async function getContributorCount(
  token: string,
  owner: string,
  repo: string,
): Promise<number> {
  try {
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=1&anon=false`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'repo-insights',
        },
      },
      `${owner}/${repo}/contributors`,
    );
    if (!res.ok) {
      if (res.status === 404) return 0;
      const body = await res.text();
      throw new GitHubApiError(
        `GitHub API ${res.status} on ${owner}/${repo}/contributors: ${body.slice(0, 200)}`,
        res.status,
      );
    }

    const link = res.headers.get('link');
    if (link) {
      const match = /page=(\d+)>; rel="last"/.exec(link);
      if (match) return Number(match[1]);
    }

    const data = (await res.json()) as unknown[];
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    if (isNotFound(err)) return 0;
    logger.warn(
      `GitHub contributor count failed for ${owner}/${repo}: ${(err as Error).message}`,
    );
    throw err;
  }
}

// ─── Phase 5: scan data ─────────────────────────────────────────────────

export type GitHubCommitListItem = {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    } | null;
  };
  author: { login: string } | null;
};

export type GitHubCommitDetail = {
  sha: string;
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
  }>;
};

export type GitHubContributor = {
  login: string;
  id: number;
  contributions: number;
  avatar_url: string;
};

export type GitHubContentEntry = {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  name: string;
  path: string;
  sha: string;
  size?: number;
};

export async function fetchRecentCommits(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  maxPages = 3,
): Promise<GitHubCommitListItem[]> {
  const all: GitHubCommitListItem[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await ghFetch<GitHubCommitListItem[]>(
      `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=100&page=${page}`,
      token,
    );
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export async function fetchCommitDetail(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<GitHubCommitDetail> {
  return ghFetch<GitHubCommitDetail>(`/repos/${owner}/${repo}/commits/${sha}`, token);
}

export async function fetchContributors(
  token: string,
  owner: string,
  repo: string,
  maxPages = 2,
): Promise<GitHubContributor[]> {
  const all: GitHubContributor[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await ghFetch<GitHubContributor[]>(
      `/repos/${owner}/${repo}/contributors?per_page=100&page=${page}&anon=false`,
      token,
    );
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export async function listContents(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<GitHubContentEntry[]> {
  try {
    const data = await ghFetch<GitHubContentEntry[] | GitHubContentEntry>(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
      token,
    );
    return Array.isArray(data) ? data : [data];
  } catch (err) {
    if (isNotFound(err)) return [];
    logger.warn(
      `GitHub contents lookup failed for ${owner}/${repo}/${path}: ${(err as Error).message}`,
    );
    throw err;
  }
}

export async function readFileText(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const data = await ghFetch<
      | { type: 'file'; content: string; encoding: string }
      | GitHubContentEntry[]
    >(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
      token,
    );
    if (Array.isArray(data)) return null;
    if (data.type !== 'file') return null;
    if (data.encoding !== 'base64') return null;
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    logger.warn(
      `GitHub file read failed for ${owner}/${repo}/${path}: ${(err as Error).message}`,
    );
    throw err;
  }
}
export type GitHubTreeEntry = {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
};

export type GitHubTreeResponse = {
  sha: string;
  url: string;
  truncated: boolean;
  tree: GitHubTreeEntry[];
};

export type GitHubWorkflowRun = {
  id: number;
  name: string | null;
  display_title?: string;
  status: string;
  conclusion: string | null;
  head_branch: string | null;
  actor: { login: string } | null;
  run_started_at: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
};

export async function fetchRepoTree(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<GitHubTreeResponse> {
  const data = await ghFetch<GitHubTreeResponse>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );
  return {
    ...data,
    tree: Array.isArray(data.tree) ? data.tree : [],
  };
}

export async function fetchWorkflowRuns(
  token: string,
  owner: string,
  repo: string,
  maxPages = 3,
): Promise<GitHubWorkflowRun[]> {
  const all: GitHubWorkflowRun[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await ghFetch<{ workflow_runs?: GitHubWorkflowRun[] }>(
      `/repos/${owner}/${repo}/actions/runs?per_page=100&page=${page}`,
      token,
    );
    const runs = batch.workflow_runs ?? [];
    all.push(...runs);
    if (runs.length < 100) break;
  }
  return all;
}
