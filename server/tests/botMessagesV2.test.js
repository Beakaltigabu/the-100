import { describe, it, expect } from 'vitest';
import * as m from '../src/services/botMessagesV2';

describe('botMessagesV2 (THE 100 BOT, English-only)', () => {
  it('renders the active home with next-milestone distance', () => {
    const t = m.homeActive({ activity: 'RUN', goal: 500, total: 310, unit: 'KM', pct: 62, day: 47, next: 375, remainingToNext: 65 });
    expect(t).toContain('DAY 47 / 100');
    expect(t).toContain("YOU'RE 62% IN.");
    expect(t).toContain('310 / 500 KM');
    expect(t).toContain('65 KM TO YOUR NEXT MILESTONE.');
  });

  it('keeps the home short when the goal is reached', () => {
    const t = m.homeActive({ activity: 'RUN', goal: 500, total: 500, unit: 'KM', pct: 100, day: 100, next: null });
    expect(t).toContain('Keep going.');
    expect(t).not.toContain('undefined');
  });

  it('renders progress, milestones and completion', () => {
    expect(m.progressMsg({ activity: 'RUN', goal: 500, total: 310, unit: 'KM', pct: 62, day: 47, remainingToGoal: 190, next: 375, remainingToNext: 65 })).toContain('190 KM REMAINING');
    const ms = m.milestonesMsg({ rows: [{ threshold: 100, unit: 'KM', reached: true }, { threshold: 250, unit: 'KM', reached: false }], current: 310, next: 250, remainingToNext: 65 });
    expect(ms).toContain('100 KM      ✓');
    expect(ms).toContain('250 KM      ○');
    expect(m.completion({ goal: 500, unit: 'KM' })).toContain('YOU DID THE 100.');
  });

  it('renders the challenge-day moments for the curated days', () => {
    expect(m.challengeDay(1)).toContain('You started.');
    expect(m.challengeDay(10)).toContain('habit');
    expect(m.challengeDay(50)).toContain('HALFWAY.');
    expect(m.challengeDay(90)).toContain('10 DAYS LEFT.');
    expect(m.challengeDay(99)).toContain('TOMORROW.');
    expect(m.challengeDay(100)).toContain('YOU DID THE 100.');
  });

  it('renders the weekly recap and re-engagement without shame', () => {
    const w = m.weeklyRecap({ week: 7, weekKm: 32.4, unit: 'KM', activities: 4, total: 312, goal: 500, pct: 62, next: 375, remainingToNext: 63 });
    expect(w).toContain('THE 100 · WEEK 7');
    expect(w).toContain('32.4 KM');
    expect(w).toContain('Another week done.');
    const r = m.reengage();
    expect(r).toContain('YOUR 100 IS STILL HERE.');
    expect(r).not.toContain('missed');
    expect(r).not.toContain('behind');
  });

  it('renders the short activity confirmation', () => {
    const a = m.activityConfirmed({ distance: 7.2, unit: 'KM', total: 317.2, goal: 500, pct: 63.4, next: 375, remainingToNext: 57.8 });
    expect(a).toContain('7.2 KM added.');
    expect(a).toContain('317.2 / 500 KM');
    expect(a).toContain('57.8 KM to go.');
  });

  it('rotates the group conversation starters by week', () => {
    expect(m.groupConversationStarter(0)).toContain('WEEKLY CHECK-IN');
    expect(m.groupConversationStarter(1)).not.toBe(m.groupConversationStarter(2));
    expect(m.groupConversationStarter(4)).toBe(m.groupConversationStarter(0));
  });

  it('renders group member moments', () => {
    expect(m.groupMemberFirstStep({ name: 'Daniel' })).toContain('FIRST STEP.');
    expect(m.groupMemberFirstStep({ name: 'Daniel' })).toContain('Daniel');
    const ms = m.groupMemberMilestone({ name: 'Hana', threshold: 250, unit: 'KM', goal: 500 });
    expect(ms).toContain('250 KM.');
    expect(ms).toContain('Hana');
    expect(ms).not.toContain('leaderboard');
    const f = m.groupMemberFinish({ name: 'Meron', goal: 500, unit: 'KM' });
    expect(f).toContain('WE HAVE A FINISHER.');
    expect(f).toContain('MERON');
  });

  it('renders group challenge moments and collective distance', () => {
    expect(m.groupChallengeMoment(1)).toContain('DAY 1');
    expect(m.groupChallengeMoment(50)).toContain('HALFWAY.');
    expect(m.groupChallengeMoment(100)).toContain('DAY 100');
    const c = m.groupCollectiveDistance({ km: 1000, people: 29 });
    expect(c).toContain('WE JUST PASSED 1,000 KM.');
    expect(c).toContain('29 people');
  });

  it('renders people-like-you without ranking', () => {
    const t = m.peopleLikeYou({
      peers: [{ name: 'Meron', total: 312, goal: 500 }, { name: 'Daniel', total: 287, goal: 500 }],
      goal: 500,
      unit: 'KM',
      activity: 'RUNNING'
    });
    expect(t).toContain('PEOPLE LIKE YOU');
    expect(t).toContain('2 other members working toward 500 KM running goals.');
    expect(t).toContain('MERON');
    expect(t).toContain('DANIEL');
    expect(t).toContain('Not ranked.');
    expect(t).not.toMatch(/1st|2nd|3rd|#1/);
  });
});