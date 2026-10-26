import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('github client timeouts', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GITHUB_FETCH_TIMEOUT_MS = '25';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_FETCH_TIMEOUT_MS;
  });

  it('aborts a hanging request and reports a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation timed out', 'TimeoutError'));
            });
          }),
      ),
    );

    const { listContents } = await import(
      '../../server/integrations/github/github.client.js'
    );

    await expect(
      listContents('token', 'owner', 'repo', '', 'main'),
    ).rejects.toMatchObject({ status: 504 });
  });
});
