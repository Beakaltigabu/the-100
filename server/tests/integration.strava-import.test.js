import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { provision, reset, destroy } from './helpers/db-test';
import * as h from './helpers/botHarness';
import { importStravaActivity } from '../src/services/stravaImport';

describe('Strava import respects the member selected activity type', () => {
  beforeAll(async () => {
    await provision();
  }, 40000);

  beforeEach(async () => {
    await reset();
  }, 20000);

  afterAll(async () => {
    await destroy();
  }, 20000);

  const ride = (id) => ({ type: 'Ride', distance: 20000, start_date: `${h.todayISO()}T08:00:00Z` });
  const run = (id) => ({ type: 'Run', distance: 5000, start_date: `${h.todayISO()}T08:00:00Z` });

  it('skips rides for a running-only member, imports runs, and dedupes', async () => {
    const u = await h.mkUser({ name: 'RunOnly', activity: 'running', qty: 0 });
    const enrollment = await h.db('enrollments').where({ id: u.eid }).first();
    expect(enrollment.activity_type).toBe('running');

    const skipped = await importStravaActivity(enrollment, ride(900001), 900001, null);
    expect(skipped).toEqual({ imported: false, reason: 'activity-type-mismatch' });

    const ok = await importStravaActivity(enrollment, run(900002), 900002, null);
    expect(ok.imported).toBe(true);

    // same activity re-imported (webhook retry) must upsert, not duplicate
    await importStravaActivity(enrollment, run(900002), 900002, null);
    const rows = await h.db('challenge_activities').where({ strava_activity_id: 900002 });
    expect(rows).toHaveLength(1);
    expect(rows[0].activity_type).toBe('running');

    const all = await h.db('challenge_activities').where({ enrollment_id: u.eid });
    expect(all).toHaveLength(1); // ride never landed
  });

  it('keeps rides for a cycling member and rejects runs', async () => {
    const u = await h.mkUser({ name: 'CycleOnly', activity: 'cycling', qty: 0 });
    const enrollment = await h.db('enrollments').where({ id: u.eid }).first();

    const ok = await importStravaActivity(enrollment, ride(900003), 900003, null);
    expect(ok.imported).toBe(true);

    const skipped = await importStravaActivity(enrollment, run(900004), 900004, null);
    expect(skipped).toEqual({ imported: false, reason: 'activity-type-mismatch' });
  });

  it('run_walk members accept both runs and walks', async () => {
    const u = await h.mkUser({ name: 'RunWalk', activity: 'run_walk', qty: 0 });
    const enrollment = await h.db('enrollments').where({ id: u.eid }).first();

    expect((await importStravaActivity(enrollment, run(900005), 900005, null)).imported).toBe(true);
    expect((await importStravaActivity(enrollment, { type: 'Walk', distance: 3000, start_date: `${h.todayISO()}T09:00:00Z` }, 900006, null)).imported).toBe(true);
  });
});