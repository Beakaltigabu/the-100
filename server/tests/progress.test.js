import { describe, it, expect } from 'vitest';
import { dayNumber, nextMilestone, reachedThresholds } from '../src/services/progress';
import { TOTAL_DAYS, ACTIVITY_MILESTONES, recommendGoals } from '../src/constants';

const RUN_THRESHOLDS = ACTIVITY_MILESTONES.running;
const RES_THRESHOLDS = ACTIVITY_MILESTONES.resistance;
const SWIM_THRESHOLDS = ACTIVITY_MILESTONES.swimming;

describe('dayNumber', () => {
  it('is 1 on the start date', () => {
    expect(dayNumber('2026-09-12', '2026-09-12')).toBe(1);
  });

  it('is 2 on the next day', () => {
    expect(dayNumber('2026-09-12', '2026-09-13')).toBe(2);
  });

  it('is 38 after 37 days', () => {
    expect(dayNumber('2026-09-12', '2026-10-19')).toBe(38);
  });

  it('clamps to TOTAL_DAYS', () => {
    expect(dayNumber('2026-09-12', '2026-12-31')).toBe(TOTAL_DAYS);
  });

  it('clamps to 1 before start', () => {
    expect(dayNumber('2026-09-12', '2026-08-01')).toBe(1);
  });
});

describe('nextMilestone', () => {
  it('returns first threshold above total for running', () => {
    expect(nextMilestone(0, RUN_THRESHOLDS)).toEqual({ threshold: 10, remaining: 10 });
    expect(nextMilestone(12.5, RUN_THRESHOLDS)).toEqual({ threshold: 50, remaining: 37.5 });
    expect(nextMilestone(320, RUN_THRESHOLDS)).toEqual({ threshold: 500, remaining: 180 });
  });

  it('uses resistance thresholds', () => {
    expect(nextMilestone(12, RES_THRESHOLDS)).toEqual({ threshold: 25, remaining: 13 });
    expect(nextMilestone(60, RES_THRESHOLDS)).toEqual({ threshold: 75, remaining: 15 });
  });

  it('uses swimming thresholds', () => {
    expect(nextMilestone(16, SWIM_THRESHOLDS)).toEqual({ threshold: 30, remaining: 14 });
  });

  it('returns null when all milestones reached', () => {
    expect(nextMilestone(1000, RUN_THRESHOLDS)).toBeNull();
    expect(nextMilestone(200, RES_THRESHOLDS)).toBeNull();
  });
});

describe('reachedThresholds', () => {
  it('lists reached thresholds', () => {
    expect(reachedThresholds(12.5, RUN_THRESHOLDS)).toEqual([10]);
    expect(reachedThresholds(250, RUN_THRESHOLDS)).toEqual([10, 50, 100, 250]);
    expect(reachedThresholds(0, RUN_THRESHOLDS)).toEqual([]);
  });
});

describe('recommendGoals', () => {
  it('recommends km bands for distance activities', () => {
    expect(recommendGoals('running', 30)).toEqual([250, 500, 750, 1000]);
    expect(recommendGoals('cycling', 5)).toEqual([50, 100, 250, 500]);
  });

  it('recommends session bands for resistance', () => {
    expect(recommendGoals('resistance', 3)).toEqual([45, 60, 90, 120]);
    expect(recommendGoals('resistance', 5)).toEqual([60, 90, 120, 150]);
  });

  it('recommends smaller km bands for swimming', () => {
    expect(recommendGoals('swimming', 3.5)).toEqual([30, 60, 100, 150]);
    expect(recommendGoals('swimming', 1)).toEqual([15, 30, 60, 100]);
  });
});