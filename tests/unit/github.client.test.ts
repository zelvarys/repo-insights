import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GitHubApiError,
  listContents,
  readFileText,
} from '../../server/integrations/github/github.client.js';

function stubFetch(status: number, body = ''): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('github client error handling', () => {
  it('throws on a 403 instead of returning an empty directory', async () => {
    stubFetch(403, '{"message":"rate limited"}');

    await expect(
      listContents('token', 'owner', 'repo', '', 'main'),
    ).rejects.toBeInstanceOf(GitHubApiError);
  });

  it('throws on a 403 instead of treating a file as missing', async () => {
    stubFetch(403, '{"message":"rate limited"}');

    await expect(
      readFileText('token', 'owner', 'repo', 'package.json', 'main'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('treats a 404 directory as an empty directory', async () => {
    stubFetch(404, '{"message":"Not Found"}');

    await expect(
      listContents('token', 'owner', 'repo', 'missing', 'main'),
    ).resolves.toEqual([]);
  });

  it('treats a 404 file as missing', async () => {
    stubFetch(404, '{"message":"Not Found"}');

    await expect(
      readFileText('token', 'owner', 'repo', 'missing.txt', 'main'),
    ).resolves.toBeNull();
  });
});
