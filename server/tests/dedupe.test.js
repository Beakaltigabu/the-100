import { describe, it, expect } from 'vitest';
import { hasStravaOverlap } from '../src/lib/dedupe';

describe('hasStravaOverlap', () => {
  it('returns false when no activities on the date', () => {
    expect(hasStravaOverlap([])).toBe(false);
  });

  it('returns false when only manual activities exist', () => {
    expect(hasStravaOverlap([{ source: 'manual' }])).toBe(false);
  });

  it('returns true when a Strava activity exists on the date', () => {
    expect(hasStravaOverlap([{ source: 'strava' }])).toBe(true);
    expect(hasStravaOverlap([{ source: 'manual' }, { source: 'strava' }])).toBe(true);
  });

  it('handles null safely', () => {
    expect(hasStravaOverlap(null)).toBe(false);
  });
});