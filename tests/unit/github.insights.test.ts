import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRepoTree,
  fetchWorkflowRuns,
} from '../../server/integrations/github/github.client.js';

function response(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHub insight fetchers', () => {
  it('fetches a recursive tree for the branch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        sha: 'root',
        url: 'https://api.github.com/tree',
        truncated: false,
        tree: [
          { path: 'src', mode: '040000', type: 'tree', sha: 'a', url: '' },
          { path: 'src/index.ts', mode: '100644', type: 'blob', sha: 'b', size: 12, url: '' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const tree = await fetchRepoTree('token', 'owner', 'repo', 'feature/x');
    expect(tree.tree).toHaveLength(2);
    expect(tree.truncated).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/repos/owner/repo/git/trees/feature%2Fx?recursive=1'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });

  it('tolerates a missing tree array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ sha: 'root' })));
    const tree = await fetchRepoTree('token', 'owner', 'repo', 'main');
    expect(tree.tree).toEqual([]);
  });

  it('pages workflow runs until a partial page', async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      head_branch: 'main',
      actor: { login: 'alice' },
      run_started_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:01:00Z',
      html_url: 'https://github.com/owner/repo/actions/runs/1',
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ workflow_runs: full }))
      .mockResolvedValueOnce(
        response({ workflow_runs: [{ ...full[0], id: 101 }] }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const runs = await fetchWorkflowRuns('token', 'owner', 'repo', 5);
    expect(runs).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toContain('/actions/runs?per_page=100&page=1');
    expect(fetchMock.mock.calls[1]![0]).toContain('/actions/runs?per_page=100&page=2');
  });

  it('stops at the workflow page cap', async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ workflow_runs: full })),
    );
    const runs = await fetchWorkflowRuns('token', 'owner', 'repo', 2);
    expect(runs).toHaveLength(200);
  });
});
