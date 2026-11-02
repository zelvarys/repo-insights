import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl } from '../../server/integrations/github/github.oauth.js';

describe('buildAuthorizeUrl', () => {
  it('requests repository and codespace write access', () => {
    const url = new URL(buildAuthorizeUrl('state-123'));
    const scope = url.searchParams.get('scope');

    expect(scope).toBe('read:user user:email repo read:org codespace');
    expect(scope?.split(' ')).toContain('repo');
    expect(scope?.split(' ')).toContain('codespace');
    expect(url.searchParams.get('state')).toBe('state-123');
  });
});
