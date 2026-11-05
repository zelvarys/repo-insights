import { describe, it, expect } from 'vitest';
import { resolveTrustProxy } from '../../server/config/env.js';

describe('resolveTrustProxy', () => {
  it('defaults to one hop in production', () => {
    expect(resolveTrustProxy('', true)).toBe(1);
  });

  it('defaults to disabled outside production', () => {
    expect(resolveTrustProxy('', false)).toBe(false);
  });

  it('parses numeric hop counts as numbers', () => {
    expect(resolveTrustProxy('2', false)).toBe(2);
  });

  it('parses boolean strings', () => {
    expect(resolveTrustProxy('true', false)).toBe(true);
    expect(resolveTrustProxy('false', true)).toBe(false);
  });

  it('passes Express trust-proxy expressions through', () => {
    expect(resolveTrustProxy('loopback', false)).toBe('loopback');
  });
});
