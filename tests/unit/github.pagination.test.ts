import { describe, expect, it } from 'vitest';
import { shouldFetchNextRepoPage } from '../../server/integrations/github/github.client.js';

describe('shouldFetchNextRepoPage', () => {
  it('keeps paging after a full raw page', () => {
    expect(shouldFetchNextRepoPage(100, 1)).toBe(true);
  });

  it('stops after a partial raw page', () => {
    expect(shouldFetchNextRepoPage(43, 1)).toBe(false);
  });

  it('stops at the page cap', () => {
    expect(shouldFetchNextRepoPage(100, 10)).toBe(false);
  });
});
