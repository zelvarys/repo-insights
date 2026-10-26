import { pool } from '../../config/database.js';
import { getAccessTokenForUser } from '../auth/auth.service.js';
import {
  listAuthenticatedUserRepos,
  getRepo,
  getContributorCount,
  type GitHubRepo,
} from '../../integrations/github/github.client.js';
import { AppError, badRequest, notFound } from '../../utils/errors.js';
import { cacheDel, cacheDelPattern, cacheKeys } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import type { TrackedRepository } from '../../../shared/types.js';

function toTracked(row: {
  id: string;
  github_id: string;
  owner: string;
  name: string;
  full_name: string;
  is_private: boolean;
  default_branch: string;
  stars: number;
  forks: number;
  contributor_count: number;
  created_at: Date;
}): TrackedRepository {
  return {
    id: row.id,
    githubId: Number(row.github_id),
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    isPrivate: row.is_private,
    defaultBranch: row.default_branch,
    stars: row.stars,
    forks: row.forks,
    contributorCount: row.contributor_count,
    createdAt: row.created_at.toISOString(),
  };
}

async function getUsernameForUser(userId: string): Promise<string> {
  const { rows } = await pool.query<{ username: string }>(
    'SELECT username FROM users WHERE id = $1',
    [userId],
  );
  const username = rows[0]?.username;
  if (!username) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return username;
}

export async function listUserGitHubRepos(
  userId: string,
  page = 1,
  perPage = 100,
): Promise<{ repos: GitHubRepo[]; hasMore: boolean; page: number }> {
  const token = await getAccessTokenForUser(userId);
  if (!token) {
    throw new AppError(
      'GitHub token unavailable — please re-authenticate',
      401,
      'UNAUTHORIZED',
    );
  }
  const userLogin = await getUsernameForUser(userId);
  const all = await listAuthenticatedUserRepos(token, userLogin);
  const start = (page - 1) * perPage;

  return {
    repos: all.slice(start, start + perPage),
    hasMore: start + perPage < all.length,
    page,
  };
}

export async function addTrackedRepository(
  userId: string,
  githubId: number,
): Promise<TrackedRepository> {
  const token = await getAccessTokenForUser(userId);
  if (!token) {
    throw new AppError(
      'GitHub token unavailable — please re-authenticate',
      401,
      'UNAUTHORIZED',
    );
  }
  const userLogin = await getUsernameForUser(userId);

  const repos = await listAuthenticatedUserRepos(token, userLogin);
  const target = repos.find((r) => r.id === githubId) ?? null;

  if (!target) {
    throw badRequest('Repository not found in your GitHub account');
  }

  await getRepo(token, target.owner.login, target.name);

  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM repositories WHERE github_id = $1',
    [githubId],
  );
  if (existing.rows.length > 0) {
    throw new AppError('Repository is already tracked', 409, 'CONFLICT');
  }

  const contributorCount = await getContributorCount(
    token,
    target.owner.login,
    target.name,
  );

  const { rows } = await pool.query(
    `INSERT INTO repositories
       (github_id, owner, name, full_name, is_private, default_branch,
        stars, forks, contributor_count, added_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, github_id, owner, name, full_name, is_private,
               default_branch, stars, forks, contributor_count, created_at`,
    [
      target.id,
      target.owner.login,
      target.name,
      target.full_name,
      target.private,
      target.default_branch,
      target.stargazers_count,
      target.forks_count,
      contributorCount,
      userId,
    ],
  );

  return toTracked(rows[0]!);
}

/**
 * Shared-workspace model: any authenticated user may remove any tracked repo.
 */
export async function deleteTrackedRepository(id: string): Promise<void> {
  await getTrackedRepository(id);

  await pool.query(
    `UPDATE scans
     SET status = 'failed', completed_at = NOW(), error = 'Repository removed'
     WHERE repo_id = $1 AND status IN ('pending','running')`,
    [id],
  );

  await pool.query('DELETE FROM repositories WHERE id = $1', [id]);

  try {
    await cacheDel(cacheKeys.scanResult(id));
    await cacheDelPattern(cacheKeys.metricsPattern(id));
  } catch (err) {
    logger.warn(
      `Failed to invalidate cache for deleted repository ${id}: ${(err as Error).message}`,
    );
  }
}

export async function listTrackedRepositories(): Promise<TrackedRepository[]> {
  const { rows } = await pool.query(
    `SELECT id, github_id, owner, name, full_name, is_private,
            default_branch, stars, forks, contributor_count, created_at
     FROM repositories
     ORDER BY created_at DESC`,
  );
  return rows.map(toTracked);
}

export async function getTrackedRepository(id: string): Promise<TrackedRepository> {
  const { rows } = await pool.query(
    `SELECT id, github_id, owner, name, full_name, is_private,
            default_branch, stars, forks, contributor_count, created_at
     FROM repositories
     WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound('Repository not found');
  return toTracked(row);
}