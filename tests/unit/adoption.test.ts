import { describe, expect, it } from 'vitest';
import { computeAdoptionRate } from '../../server/modules/tools/detectors/adoption.js';

describe('computeAdoptionRate', () => {
  it('never exceeds 100 when commits include authors outside the contributor list', () => {
    expect(
      computeAdoptionRate(['alice'], { alice: true, mallory: true }, true),
    ).toBe(100);
  });

  it('does not double count duplicate contributor logins', () => {
    expect(
      computeAdoptionRate(['alice', 'alice'], { alice: true }, true),
    ).toBe(100);
  });

  it('counts only contributors in the denominator', () => {
    expect(
      computeAdoptionRate(['alice', 'bob'], { alice: true }, true),
    ).toBe(50);
  });

  it('returns zero when undetected or no contributors', () => {
    expect(computeAdoptionRate(['alice'], { alice: true }, false)).toBe(0);
    expect(computeAdoptionRate([], { alice: true }, true)).toBe(0);
  });
});
