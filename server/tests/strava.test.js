import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapStravaType } from '../src/services/stravaImport';
import { RateLimitedError, record, canCall, guardCall, usage } from '../src/services/stravaRateLimit';

describe('mapStravaType', () => {
  it('maps supported types', () => {
    expect(mapStravaType('Run')).toBe('running');
    expect(mapStravaType('Walk')).toBe('walking');
    expect(mapStravaType('Ride')).toBe('cycling');
    expect(mapStravaType('Swim')).toBe('swimming');
  });

  it('returns null for unsupported types', () => {
    expect(mapStravaType('WeightTraining')).toBeNull();
    expect(mapStravaType('Workout')).toBeNull();
    expect(mapStravaType('AlpineSki')).toBeNull();
    expect(mapStravaType('VirtualRide')).toBeNull();
  });
});

describe('stravaRateLimit', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('allows calls under the threshold', () => {
    expect(canCall()).toBe(true);
    expect(() => guardCall()).not.toThrow();
  });

  it('records usage from headers and blocks near the limit', () => {
    const fakeRes = {
      headers: { get: (h) => (h === 'X-RateLimit-Limit' ? '100,1000' : '95,500') }
    };
    record(fakeRes);
    expect(usage().shortUsage).toBe(95);
    expect(canCall()).toBe(false);
    expect(() => guardCall()).toThrow(RateLimitedError);
  });

  it('falls back to incrementing when headers are absent', () => {
    const fakeRes = { headers: { get: () => null } };
    const before = usage().shortUsage;
    record(fakeRes);
    expect(usage().shortUsage).toBe(before + 1);
  });
});