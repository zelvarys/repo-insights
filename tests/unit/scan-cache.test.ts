import { describe, expect, it } from 'vitest';
import { shouldReplaceCachedScan } from '../../server/modules/scans/scan.service.js';
import type { ScanSummary } from '../../shared/types.js';

function scan(id: string, createdAt: string): ScanSummary {
  return {
    id,
    repoId: 'repo',
    status: 'complete',
    startedAt: null,
    completedAt: null,
    error: null,
    summary: null,
    createdAt,
  };
}

describe('shouldReplaceCachedScan', () => {
  it('lets a newer scan replace an older cache entry', () => {
    expect(
      shouldReplaceCachedScan(
        { scan: scan('old', '2026-01-01T00:00:00.000Z'), writtenAt: 1 },
        scan('new', '2026-01-01T01:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('refuses to overwrite a newer scan with an older retry', () => {
    expect(
      shouldReplaceCachedScan(
        { scan: scan('new', '2026-01-01T01:00:00.000Z'), writtenAt: 1 },
        scan('old', '2026-01-01T00:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('writes when the cache is empty', () => {
    expect(
      shouldReplaceCachedScan(null, scan('new', '2026-01-01T00:00:00.000Z')),
    ).toBe(true);
  });
});
