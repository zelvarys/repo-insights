import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAuthenticatedUserRepos } from '../../server/integrations/github/github.client.js';

type RestRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
};

function restRepo(
  id: number,
  fullName: string,
  overrides: Partial<RestRepo> = {},
): RestRepo {
  const [owner, name] = fullName.split('/');
  return {
    id,
    name: name!,
    full_name: fullName,
    owner: { login: owner! },
    private: false,
    default_branch: 'main',
    stargazers_count: 0,
    forks_count: 0,
    ...overrides,
  };
}

function contributionNode(
  id: number,
  fullName: string,
  overrides: Record<string, unknown> = {},
) {
  const [owner, name] = fullName.split('/');
  return {
    repository: {
      databaseId: id,
      name: name!,
      nameWithOwner: fullName,
      owner: { login: owner! },
      isPrivate: false,
      defaultBranchRef: { name: 'main' },
      stargazerCount: 0,
      forkCount: 0,
      ...overrides,
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listAuthenticatedUserRepos', () => {
  it('includes external repos the user opened a PR in or committed to', async () => {
    const restRepos = [
      restRepo(1, 'alice/owned', { stargazers_count: 10 }),
      restRepo(2, 'carol/not-contributed'),
    ];
    let query = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === 'https://api.github.com/graphql') {
          query = String(init?.body);
          return jsonResponse({
            data: {
              user: {
                contributionsCollection: {
                  commitContributionsByRepository: [
                    contributionNode(1, 'alice/owned'),
                    contributionNode(30, 'dave/external-commit', {
                      defaultBranchRef: null,
                      stargazerCount: 3,
                    }),
                    contributionNode(99, 'skip/no-rest-id', {
                      databaseId: null,
                    }),
                  ],
                  pullRequestContributionsByRepository: [
                    contributionNode(20, 'bob/external-pr', {
                      stargazerCount: 5,
                      forkCount: 2,
                    }),
                    contributionNode(20, 'bob/external-pr'),
                  ],
                },
              },
            },
          });
        }

        if (url.includes('/user/repos?')) {
          return jsonResponse(restRepos);
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const repos = await listAuthenticatedUserRepos('token', 'alice');

    expect(repos.map((repo) => repo.full_name)).toEqual([
      'dave/external-commit',
      'bob/external-pr',
      'alice/owned',
    ]);
    expect(repos[0]).toMatchObject({
      id: 30,
      default_branch: 'main',
      stargazers_count: 3,
    });
    expect(repos[1]).toMatchObject({
      id: 20,
      name: 'external-pr',
      owner: { login: 'bob' },
      stargazers_count: 5,
      forks_count: 2,
      default_branch: 'main',
    });
    expect(repos.some((repo) => repo.full_name === 'carol/not-contributed')).toBe(
      false,
    );
    expect(repos.some((repo) => repo.full_name === 'skip/no-rest-id')).toBe(false);
    expect(query).toContain('pullRequestContributionsByRepository');
    expect(query).toContain('commitContributionsByRepository');
  });
});
