import { getAccessTokenForUser } from '../auth/auth.service.js';
import { getTrackedRepository } from '../repositories/repository.service.js';
import {
  GitHubApiError,
  createCodespace as createGitHubCodespace,
  createIssue as createGitHubIssue,
  rerunWorkflowRun,
} from '../../integrations/github/github.client.js';
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from '../../utils/errors.js';
import type {
  CreateCodespaceResponse,
  CreateIssueResponse,
  RerunWorkflowResponse,
} from '../../../shared/types.js';

async function actionContext(repoId: string, userId: string) {
  const repo = await getTrackedRepository(repoId);
  const token = await getAccessTokenForUser(userId);
  if (!token) {
    throw unauthorized('GitHub token unavailable — please re-authenticate');
  }
  return { repo, token };
}

function throwGitHubError(err: unknown, action: string): never {
  if (!(err instanceof GitHubApiError)) throw err;
  if (err.status === 401 || err.status === 403) {
    throw forbidden(
      `GitHub denied permission to ${action}. Re-authenticate with the required scopes.`,
    );
  }
  if (err.status === 404) {
    throw notFound(`GitHub could not find the resource to ${action}`);
  }
  if (err.status === 409) {
    throw conflict(`GitHub rejected the request to ${action}`);
  }
  if (err.status === 422) {
    throw badRequest(`GitHub rejected the request to ${action}`);
  }
  if (err.status === 429) {
    throw new AppError('GitHub rate limit exceeded', 429, 'RATE_LIMITED');
  }
  throw new AppError(`GitHub failed to ${action}`, 502, 'GITHUB_ERROR');
}

export async function rerunWorkflow(
  repoId: string,
  userId: string,
  runId: number,
): Promise<RerunWorkflowResponse> {
  const { repo, token } = await actionContext(repoId, userId);
  try {
    await rerunWorkflowRun(token, repo.owner, repo.name, runId);
  } catch (err) {
    throwGitHubError(err, 're-run the workflow');
  }
  return { runId, queued: true };
}

export async function createIssue(
  repoId: string,
  userId: string,
  title: string,
  body: string,
): Promise<CreateIssueResponse> {
  const { repo, token } = await actionContext(repoId, userId);
  try {
    const issue = await createGitHubIssue(
      token,
      repo.owner,
      repo.name,
      title,
      body,
    );
    return {
      issue: {
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
      },
    };
  } catch (err) {
    throwGitHubError(err, 'create the issue');
  }
}

export async function createCodespace(
  repoId: string,
  userId: string,
  ref?: string,
): Promise<CreateCodespaceResponse> {
  const { repo, token } = await actionContext(repoId, userId);
  try {
    const codespace = await createGitHubCodespace(
      token,
      repo.owner,
      repo.name,
      ref ?? repo.defaultBranch,
    );
    return {
      codespace: {
        name: codespace.name,
        webUrl: codespace.web_url,
        state: codespace.state,
      },
    };
  } catch (err) {
    throwGitHubError(err, 'create the codespace');
  }
}
