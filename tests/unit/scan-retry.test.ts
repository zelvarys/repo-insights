import { describe, it, expect } from 'vitest';
import { isFinalAttempt } from '../../server/modules/scans/scan.retry.js';

describe('isFinalAttempt', () => {
  it('treats a single-attempt job as final', () => {
    expect(isFinalAttempt({ attemptsMade: 0, opts: { attempts: 1 } })).toBe(
      true,
    );
  });

  it('does not treat earlier attempts as final', () => {
    expect(isFinalAttempt({ attemptsMade: 0, opts: { attempts: 3 } })).toBe(
      false,
    );
    expect(isFinalAttempt({ attemptsMade: 1, opts: { attempts: 3 } })).toBe(
      false,
    );
  });

  it('treats the last configured attempt as final', () => {
    expect(isFinalAttempt({ attemptsMade: 2, opts: { attempts: 3 } })).toBe(
      true,
    );
  });
});
