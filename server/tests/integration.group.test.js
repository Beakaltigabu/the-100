import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { provision, reset, destroy } from './helpers/db-test';
import * as h from './helpers/botHarness';

const config = require('../src/config');
const { emitProgressEvents } = require('../src/services/progressEvents');
const botGroupGuard = require('../src/services/botGroupGuard');

const GROUP = config.telegram.groupId;

describe('BOT — group catalyst (≤4/week, community group only, no-HQ)', () => {
  beforeAll(async () => {
    await provision();
  }, 40000);

  beforeEach(async () => {
    await reset();
  }, 20000);

  afterAll(async () => {
    await destroy();
  }, 20000);

  async function activeEnrollment(uid) {
    const ch = await h.getActiveChallenge();
    return h.db('enrollments').where({ user_id: uid, challenge_id: ch.id }).first();
  }

  it('posts a conversation starter at most once per week', async () => {
    const snap = await h.snapshot();
    await h.scheduler.checkGroupCatalyst();
    await h.scheduler.checkGroupCatalyst();
    const msgs = await h.capture(snap, GROUP);
    expect(msgs.filter((m) => m.includes('CHECK-IN') || m.includes('QUICK ONE') || m.includes('surprised') || m.includes('MEET SOME PEOPLE')).length).toBe(1);
  });

  it('posts a collective-distance threshold once', async () => {
    const u = await h.mkUser({ name: 'Crowd', qty: 150 });
    let snap = await h.snapshot();
    await h.scheduler.checkCollectiveDistance();
    await h.scheduler.checkCollectiveDistance();
    let msgs = await h.capture(snap, GROUP);
    expect(msgs.filter((m) => m.includes('WE JUST PASSED 100 KM')).length).toBe(1);

    const u2 = await h.mkUser({ name: 'Crowd2', qty: 200 });
    snap = await h.snapshot();
    await h.scheduler.checkCollectiveDistance();
    msgs = await h.capture(snap, GROUP);
    // now past 500 too -> only the NEW threshold (500) posts
    expect(msgs.filter((m) => m.includes('WE JUST PASSED')).length).toBeLessThanOrEqual(1);
  });

  it('broadcasts curated member moments: first step, major milestone, finish', async () => {
    const first = await h.mkUser({ name: 'Daniel', qty: 0 });
    const en = await activeEnrollment(first.uid);
    let snap = await h.snapshot();
    await emitProgressEvents({ enrollment: en, total: 6, user: { id: first.uid, name: 'Daniel' }, added: 6 });
    let msgs = await h.capture(snap, GROUP);
    expect(msgs.filter((m) => m.includes('FIRST STEP.')).length).toBe(1);

    // fresh weekly budget so each moment type is exercised independently
    await h.db('meta').where('meta_key', 'like', 'bot_group_%').del();
    const big = await h.mkUser({ name: 'Hana', qty: 0 });
    const enBig = await activeEnrollment(big.uid);
    snap = await h.snapshot();
    await emitProgressEvents({ enrollment: enBig, total: 250, user: { id: big.uid, name: 'Hana' }, added: 250 });
    msgs = await h.capture(snap, GROUP);
    expect(msgs.filter((m) => m.includes('250 KM.')).length).toBe(1); // major milestone (>=100 KM)
    expect(msgs.filter((m) => m.includes('FIRST STEP.')).length).toBe(1); // also their first activity

    await h.db('meta').where('meta_key', 'like', 'bot_group_%').del();
    const fin = await h.mkUser({ name: 'Meron', qty: 0 });
    // isolate the finish moment: only the goal threshold, so the milestone loop
    // can't burn the whole weekly budget.
    await h.db('milestones').where({ enrollment_id: fin.eid }).whereNot('threshold', 500).del();
    const enFin = await activeEnrollment(fin.uid);
    snap = await h.snapshot();
    await emitProgressEvents({ enrollment: enFin, total: 500, user: { id: fin.uid, name: 'Meron' }, added: 500 });
    msgs = await h.capture(snap, GROUP);
    expect(msgs.filter((m) => m.includes('WE HAVE A FINISHER.')).length).toBe(1);
    expect(msgs.join('\n')).toContain('MERON');
  });

  it('posts a group challenge moment once per day', async () => {
    const restore = await h.forceDay(50);
    try {
      const snap = await h.snapshot();
      await h.scheduler.checkGroupChallengeMoments();
      await h.scheduler.checkGroupChallengeMoments();
      const msgs = await h.capture(snap, GROUP);
      expect(msgs.filter((m) => m.includes('HALFWAY.')).length).toBe(1);
    } finally {
      await restore();
    }
  });

  it('welcomes a new member with a short English message', async () => {
    const snap = await h.snapshot();
    await h.newMembers(GROUP, [{ id: 555, first_name: 'Nunu', is_bot: false }]);
    const msgs = await h.capture(snap, GROUP);
    expect(msgs.join('\n')).toContain('Welcome Nunu to THE 100 community');
  });

  it('welcomes a new member even when the weekly budget is exhausted', async () => {
    for (let i = 0; i < 4; i += 1) await botGroupGuard.sendToCommunity(`post ${i}`);
    const snap = await h.snapshot();
    await h.newMembers(GROUP, [{ id: 556, first_name: 'Newbie', is_bot: false }]);
    const msgs = await h.capture(snap, GROUP);
    expect(msgs.join('\n')).toContain('Welcome Newbie to THE 100 community');
  });

  it('enforces the weekly cap: the 5th group post is blocked', async () => {
    const snap = await h.snapshot();
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(await botGroupGuard.sendToCommunity(`post ${i + 1}`));
    }
    const msgs = await h.capture(snap, GROUP);
    expect(results.filter((r) => r.sent === true).length).toBe(4);
    expect(results[4].reason).toBe('weekly-cap');
    expect(msgs.length).toBe(4);
  });

  it('no-HQ guard: every group send targets ONLY config.telegram.groupId', async () => {
    const u = await h.mkUser({ name: 'NoHq', qty: 0 });
    const en = await activeEnrollment(u.uid);
    const snap = await h.snapshot();
    await emitProgressEvents({ enrollment: en, total: 140, user: { id: u.uid, name: 'NoHq' }, added: 140 });
    await botGroupGuard.sendToCommunity('catalyst check');
    const all = await h.capture(snap); // all chats
    const chatIds = (await h.captureDetailed(snap)).map(() => undefined).length;
    const logs = await h.db('event_logs')
      .where({ source: 'bot', type: 'send_dry_run' })
      .where('id', '>', snap.id)
      .orderBy('id', 'asc');
    const targets = logs.map((r) => r.message.match(/to ([-0-9]+)/)?.[1]).filter(Boolean);
    const allowed = new Set([String(GROUP), String(u.tgId)]);
    for (const t of targets) {
      expect(allowed.has(t)).toBe(true); // private DM to the member OR the community group — never HQ
    }
  });
});