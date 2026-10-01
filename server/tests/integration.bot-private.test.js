import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { provision, reset, destroy } from './helpers/db-test';
import * as h from './helpers/botHarness';

describe('BOT — private companion flows', () => {
  beforeAll(async () => {
    await provision();
  }, 40000);

  beforeEach(async () => {
    await reset();
  }, 20000);

  afterAll(async () => {
    await destroy();
  }, 20000);

  it('onboards a freshly connected member via deep link', async () => {
    const u = await h.mkUser({ name: 'Ada', linked: false });
    const chat = 900000001;
    const token = await h.mkInvite(u.uid);
    let snap = await h.snapshot();
    await h.tgMessage({ chat: { id: chat, type: 'private' }, from: { id: chat, language_code: 'en' }, text: `/start ${token}` });
    let msgs = await h.capture(snap, chat);
    expect(msgs.join('\n')).toContain("YOU'RE IN.");
    expect(msgs.join('\n')).toContain('Your 100:');

    snap = await h.snapshot();
    await h.cb(chat, 'onboard:see');
    msgs = await h.capture(snap, chat);
    expect(msgs.join('\n')).toContain('ONE LAST THING.');

    snap = await h.snapshot();
    await h.cb(chat, 'onboard:manual');
    msgs = await h.capture(snap, chat);
    expect(msgs.join('\n')).toContain("YOU'RE READY.");

    const conn = await h.db('telegram_connections').where({ user_id: u.uid }).first();
    expect(conn.state).toBe('active');
    expect(conn.telegram_user_id).toBe(chat);
  });

  it('skips the tracking choice on onboarding when Strava is already connected', async () => {
    const u = await h.mkUser({ name: 'StravaOnboard', linked: false, strava: true });
    const chat = 900000999;
    const token = await h.mkInvite(u.uid);
    let snap = await h.snapshot();
    await h.tgMessage({ chat: { id: chat, type: 'private' }, from: { id: chat, language_code: 'en' }, text: `/start ${token}` });
    let msgs = await h.capture(snap, chat);
    expect(msgs.join('\n')).toContain("YOU'RE IN.");

    snap = await h.snapshot();
    await h.cb(chat, 'onboard:see');
    msgs = await h.capture(snap, chat);
    expect(msgs.join('\n')).toContain("YOU'RE READY.");
    expect(msgs.join('\n')).not.toContain('ONE LAST THING.');
  });

  it('rejects an invalid /start token and an unlinked callback', async () => {
    const snap = await h.snapshot();
    await h.tgMessage({ chat: { id: 900000002, type: 'private' }, from: { id: 900000002, language_code: 'en' }, text: '/start bogus' });
    let msgs = await h.capture(snap, 900000002);
    expect(msgs.join('\n')).toMatch(/invalid|expired|link/i);

    const snap2 = await h.snapshot();
    await h.cb(900000003, 'home');
    msgs = await h.capture(snap2, 900000003);
    expect(msgs.join('\n')).toMatch(/linked|Telegram/i);
  });

  it('renders home variants: not-started, active, completed', async () => {
    const fresh = await h.mkUser({ name: 'NoQty', qty: 0 });
    let snap = await h.snapshot();
    await h.cb(fresh.tgId, 'home');
    let msgs = await h.capture(snap, fresh.tgId);
    expect(msgs.join('\n')).toContain('YOUR 100 IS READY.');

    const active = await h.mkUser({ name: 'Halfway', qty: 310 });
    snap = await h.snapshot();
    await h.cb(active.tgId, 'home');
    msgs = await h.capture(snap, active.tgId);
    expect(msgs.join('\n')).toContain('310 / 500 KM');
    expect(msgs.join('\n')).toContain("YOU'RE 62% IN.");

    const done = await h.mkUser({ name: 'Fin', status: 'completed', qty: 500 });
    snap = await h.snapshot();
    await h.cb(done.tgId, 'home');
    msgs = await h.capture(snap, done.tgId);
    expect(msgs.join('\n')).toContain('YOU DID THE 100.');
  });

  it('renders progress, milestones and community pulse from real data', async () => {
    const u = await h.mkUser({ name: 'Mile', qty: 310 });
    let snap = await h.snapshot();
    await h.cb(u.tgId, 'progress');
    let msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('310 KM');
    expect(msgs.join('\n')).toContain('62%');
    expect(msgs.join('\n')).toContain('190 KM REMAINING');

    snap = await h.snapshot();
    await h.cb(u.tgId, 'milestones');
    msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('NEXT');
    expect(msgs.join('\n')).toContain('375');

    snap = await h.snapshot();
    await h.cb(u.tgId, 'community');
    msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('THE COMMUNITY TODAY');
    expect(msgs.join('\n')).toContain('members');
  });

  it('logs an activity through the button flow and persists to the website with one confirmation', async () => {
    const u = await h.mkUser({ name: 'Logg', qty: 0 });
    const snap = await h.snapshot();
    await h.cb(u.tgId, 'log');
    await h.cb(u.tgId, 'log_type:running');
    await h.cb(u.tgId, 'log_dist:7.2');
    await h.cb(u.tgId, 'log_date:today');
    await h.cb(u.tgId, 'log_confirm');
    const msgs = await h.capture(snap, u.tgId);
    // exactly ONE message to the member (the inline confirmation) — no extra DM
    expect(msgs.filter((m) => m.includes('ACTIVITY LOGGED')).length).toBe(1);
    expect(msgs.join('\n')).toContain('7.2 KM');
    expect(msgs.join('\n')).toContain('0 → 7.2 KM');
    // website row persisted
    const row = await h.db('challenge_activities').where({ enrollment_id: u.eid }).first();
    expect(Number(row.quantity)).toBe(7.2);
    expect(row.source).toBe('manual');
  });

  it('accepts a custom distance via text input and rejects an out-of-window date', async () => {
    const u = await h.mkUser({ name: 'Custom', qty: 0 });
    await h.cb(u.tgId, 'log');
    await h.cb(u.tgId, 'log_type:running');
    await h.cb(u.tgId, 'log_dist:custom');
    let snap = await h.snapshot();
    await h.tgMessage({ chat: { id: u.tgId, type: 'private' }, from: { id: u.tgId }, text: '42.5' });
    let msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('WHEN?');

    await h.cb(u.tgId, 'log_date:custom');
    snap = await h.snapshot();
    await h.tgMessage({ chat: { id: u.tgId, type: 'private' }, from: { id: u.tgId }, text: '2020-01-01' });
    msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('WHEN?');

    snap = await h.snapshot();
    await h.cb(u.tgId, 'log_confirm');
    msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toMatch(/window|outside|could not/i);
    const after = await h.db('challenge_activities').where({ enrollment_id: u.eid }).countDistinct({ c: 'id' }).first();
    expect(Number(after.c)).toBe(0);
  });

  it('renders Strava connected (last synced) and not-connected (connect prompt)', async () => {
    const linked = await h.mkUser({ name: 'Strava', strava: true, qty: 40 });
    let snap = await h.snapshot();
    await h.cb(linked.tgId, 'strava');
    let msgs = await h.capture(snap, linked.tgId);
    expect(msgs.join('\n')).toContain('STRAVA CONNECTED');
    expect(msgs.join('\n')).toContain('Last synced:');

    const manual = await h.mkUser({ name: 'Manual' });
    snap = await h.snapshot();
    await h.cb(manual.tgId, 'strava');
    msgs = await h.capture(snap, manual.tgId);
    expect(msgs.join('\n')).toMatch(/Connect Strava/i);
  });

  it('toggles settings and cycles reminders', async () => {
    const u = await h.mkUser({ name: 'Settings' });
    let snap = await h.snapshot();
    await h.cb(u.tgId, 'settings');
    let msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('MILESTONES   ON');
    expect(msgs.join('\n')).toContain('REMINDERS    OCCASIONALLY');

    snap = await h.snapshot();
    await h.cb(u.tgId, 'settings:toggle:milestones');
    msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('MILESTONES   OFF');

    snap = await h.snapshot();
    await h.cb(u.tgId, 'settings:reminders:never');
    msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('REMINDERS    NEVER');
  });

  it('shows people-like-you for same-goal members only, unranked', async () => {
    const a = await h.mkUser({ name: 'Adam', activity: 'running', goal: 500, qty: 312 });
    await h.mkUser({ name: 'Beth', activity: 'running', goal: 500, qty: 287 });
    await h.mkUser({ name: 'Cara', activity: 'running', goal: 500, qty: 341 });
    await h.mkUser({ name: 'Dina', activity: 'running', goal: 250, qty: 180 });
    await h.mkUser({ name: 'Eli', activity: 'walking', goal: 500, qty: 100 });
    const snap = await h.snapshot();
    await h.cb(a.tgId, 'people');
    const msgs = await h.capture(snap, a.tgId);
    const text = msgs.join('\n');
    expect(text).toContain('PEOPLE LIKE YOU');
    expect(text).toContain('2 other members working toward 500 KM running goals.');
    expect(text).toContain('BETH');
    expect(text).toContain('CARA');
    expect(text).not.toContain('DINA');
    expect(text).not.toContain('ELI');
    expect(text).not.toMatch(/#1|1st|2nd|3rd/);
  });

  it('treats the removed share callbacks as a no-op', async () => {
    const u = await h.mkUser({ name: 'Sharer', qty: 310 });
    const snap = await h.snapshot();
    await h.cb(u.tgId, 'share');
    await h.cb(u.tgId, 'share_confirm');
    const msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).not.toContain('SHARED');
    const post = await h.db('community_posts').where({ user_id: u.uid }).first();
    expect(post).toBeFalsy();
  });

  it('supports command shortcuts and the completion what-next path', async () => {
    const u = await h.mkUser({ name: 'Cmd' });
    let snap = await h.snapshot();
    await h.command(u.tgId, u.uid, 'progress');
    let msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('YOUR PROGRESS');

    const done = await h.mkUser({ name: 'Done', status: 'completed', qty: 500 });
    snap = await h.snapshot();
    await h.cb(done.tgId, 'whats_next');
    msgs = await h.capture(snap, done.tgId);
    expect(msgs.join('\n')).toContain('Your 100 is done.');
  });
});