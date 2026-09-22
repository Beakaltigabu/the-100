import { describe, it, expect } from 'vitest';
import { recommendGoals } from '../src/constants';

const DISTANCE = ['running', 'walking', 'run_walk', 'cycling', 'other'];
const BASELINES = [0, 5, 15, 30, 50, 90];

describe('recommendGoals', () => {
  it('returns 4 strictly increasing, distinct values for distance activities', () => {
    for (const type of DISTANCE) {
      for (const base of BASELINES) {
        const bands = recommendGoals(type, base);
        expect(bands).toHaveLength(4);
        expect(bands[0]).toBeLessThan(bands[1]);
        expect(bands[1]).toBeLessThan(bands[2]);
        expect(bands[2]).toBeLessThan(bands[3]);
        expect(new Set(bands).size).toBe(4); // no duplicate tiers (e.g. hard === extreme)
      }
    }
  });

  it('returns distinct values for swimming and resistance across baselines', () => {
    for (const type of ['swimming', 'resistance']) {
      for (const base of [0, 1, 3, 7, 12, 30]) {
        const bands = recommendGoals(type, base);
        expect(bands).toHaveLength(4);
        expect(new Set(bands).size).toBe(4);
      }
    }
  });
});