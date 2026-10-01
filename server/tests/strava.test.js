import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapStravaType, localDateOf } from '../src/services/stravaImport';
import { resolveSyncAfter } from '../src/services/stravaSync';
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

describe('localDateOf', () => {
  it('returns the UTC date when the input has no timezone info', () => {
    expect(localDateOf('2026-09-23T06:00:00Z')).toBe('2026-09-23');
  });
});

describe('resolveSyncAfter', () => {
  it('defaults to the challenge start day (2026-09-23) when nothing has synced', () => {
    const after = resolveSyncAfter({ lastSyncedAt: null, connectedAt: null, challengeStartDate: '2026-09-23' });
    expect(after).toBe(Math.floor(new Date('2026-09-23T00:00:00').getTime() / 1000));
  });

  it('uses the last successful sync when it is more recent than the challenge start', () => {
    const after = resolveSyncAfter({
      lastSyncedAt: '2026-09-25 14:00:00',
      connectedAt: '2026-09-20 09:00:00',
      challengeStartDate: '2026-09-23'
    });
    expect(after).toBe(Math.floor(new Date('2026-09-25T00:00:00').getTime() / 1000));
  });

  it('floors the initial backfill at the challenge start even if connected later', () => {
    const after = resolveSyncAfter({
      lastSyncedAt: null,
      connectedAt: '2026-09-24 10:00:00',
      challengeStartDate: '2026-09-23'
    });
    expect(after).toBe(Math.floor(new Date('2026-09-23T00:00:00').getTime() / 1000));
  });

  it('prefers the challenge start over an older connection', () => {
    const after = resolveSyncAfter({
      lastSyncedAt: null,
      connectedAt: '2026-09-10 10:00:00',
      challengeStartDate: '2026-09-23'
    });
    expect(after).toBe(Math.floor(new Date('2026-09-23T00:00:00').getTime() / 1000));
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