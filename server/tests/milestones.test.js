import { describe, it, expect } from 'vitest';
import { computeReachedMilestones } from '../src/services/milestones';

const ROWS = [
  { threshold: 10, reached_at: null },
  { threshold: 50, reached_at: null },
  { threshold: 100, reached_at: null }
];

describe('computeReachedMilestones', () => {
  it('returns thresholds crossed by the total', () => {
    expect(computeReachedMilestones(ROWS, 60).sort()).toEqual([10, 50]);
  });

  it('returns empty when total crosses nothing', () => {
    expect(computeReachedMilestones(ROWS, 5)).toEqual([]);
  });

  it('does not re-report already reached milestones', () => {
    const rows = [{ threshold: 10, reached_at: '2026-01-01' }, { threshold: 50, reached_at: null }];
    expect(computeReachedMilestones(rows, 60)).toEqual([50]);
  });

  it('crosses the exact threshold value', () => {
    expect(computeReachedMilestones(ROWS, 50).sort()).toEqual([10, 50]);
  });
});