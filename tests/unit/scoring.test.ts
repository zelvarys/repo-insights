import { describe, expect, it } from 'vitest';
import { computeScore } from '../../server/modules/metrics/scoring.js';
import type { ToolMetric } from '../../shared/types.js';

function tool(overrides: Partial<ToolMetric> & { name: string }): ToolMetric {
  return {
    category: 'testing',
    detected: false,
    relevant: true,
    tracked: false,
    adoptionRate: 0,
    contributorCount: 0,
    contributorsUsing: 0,
    countsTowardScore: true,
    evidence: null,
    ...overrides,
  };
}

describe('computeScore', () => {
  it('scores detected relevant tools when none are explicitly tracked', () => {
    const metrics = computeScore(
      [
        tool({ name: 'jest', detected: true, adoptionRate: 100 }),
        tool({ name: 'pytest', detected: true, adoptionRate: 50, relevant: false }),
        tool({ name: 'eslint', detected: false, adoptionRate: 0 }),
      ],
      new Set(),
    );

    expect(metrics.toolsTracked).toBe(1);
    expect(metrics.toolsDetected).toBe(1);
    expect(metrics.coverage).toBe(100);
    expect(metrics.adoption).toBe(100);
    expect(metrics.adoptionScore).toBe(100);
  });

  it('excludes commit-presence tools from adoption but keeps them in coverage', () => {
    const metrics = computeScore(
      [
        tool({ name: 'jest', detected: true, adoptionRate: 50 }),
        tool({ name: 'eslint', detected: false }),
        tool({
          name: 'github-actions',
          category: 'ci_cd',
          detected: true,
          adoptionRate: 100,
        }),
      ],
      new Set(['jest', 'eslint', 'github-actions']),
    );

    expect(metrics.toolsTracked).toBe(3);
    expect(metrics.toolsDetected).toBe(2);
    expect(metrics.coverage).toBe(66.67);
    expect(metrics.adoption).toBe(50);
    expect(metrics.adoptionScore).toBe(33.33);
  });

  it('returns zeroes when there are no tools', () => {
    const metrics = computeScore([], new Set());

    expect(metrics.adoptionScore).toBe(0);
    expect(metrics.coverage).toBe(0);
    expect(metrics.adoption).toBe(0);
    expect(metrics.toolsChecked).toBe(0);
  });
});
