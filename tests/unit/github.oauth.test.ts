import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl } from '../../server/integrations/github/github.oauth.js';

describe('buildAuthorizeUrl', () => {
  it('requests read-only repository access', () => {
    const url = new URL(buildAuthorizeUrl('state-123'));
    const scope = url.searchParams.get('scope');

    expect(scope).toBe('read:user user:email public_repo read:org');
    expect(scope?.split(' ')).not.toContain('repo');
    expect(url.searchParams.get('state')).toBe('state-123');
  });
});
