import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as handlers from '../src/routes/webhooks/telegram';
import { parseCheckin, resolveLanguage, formatStartDate } from '../src/lib/telegram';
import * as botMessages from '../src/services/botMessages';

// Fixtures and a chainable fake DB that respects `where` filters.
const tables = {
  telegram_connections: [{ id: 1, user_id: 7, state: 'active', telegram_user_id: 111 }],
  users: [{ id: 7, language: 'en' }],
  enrollments: [
    { id: 5, user_id: 7, challenge_id: 1, goal_value: 100, status: 'active', activity_type: 'running', start_date: '2026-09-21', is_active: 1 }
  ],
  challenges: [{ id: 1, start_date: '2026-09-21', end_date: '2026-12-29', is_active: 1 }],
  challenge_activities: []
};

const updates = [];

function makeDb(table) {
  let wheres = {};
  const rows = () => tables[table] || [];
  const chain = {
    join: () => chain,
    where: (w) => {
      wheres = { ...wheres, ...w };
      return chain;
    },
    whereIn: () => chain,
    groupBy: () => chain,
    select: () => chain,
    distinct: () => chain,
    sum: () => chain,
    countDistinct: () => chain,
    count: () => chain,
    max: () => chain,
    first: async () =>
      rows().find((r) =>
        Object.entries(wheres).every(([k, v]) => {
          const col = k.split('.').pop(); // "enrollments.user_id" -> "user_id"
          return r[col] == v; // loose: mysql booleans arrive as 1/0
        })
      ),
    update: async (data) => {
      updates.push({ table, data });
      return 1;
    },
    insert: async () => [999],
    del: async () => 1
  };
  return chain;
}
makeDb.fn = { now: () => '2026-09-19' };

const messenger = {
  sendToChat: vi.fn(),
  getUserLanguage: vi.fn(async () => 'en'),
  joinCommunityMarkup: vi.fn(() => ({})),
  approveJoinRequest: vi.fn(async () => true)
};

const mockLogActivity = vi.fn(async () => ({ ok: true, total: 25 }));

beforeEach(() => {
  messenger.sendToChat.mockClear();
  messenger.approveJoinRequest.mockClear();
  messenger.getUserLanguage.mockClear();
  mockLogActivity.mockClear();
  updates.length = 0;
  handlers.__setDeps({
    db: makeDb,
    messenger,
    logActivity: mockLogActivity,
    computeStreaks: async () => [],
    challengeWindow: {
      getActiveChallenge: async () => tables.challenges[0],
      hasChallengeStarted: () => true
    }
  });
});

describe('parseCheckin', () => {
  it('accepts plain distances', () => {
    expect(parseCheckin('8.4', 200)).toBe(8.4);
    expect(parseCheckin('3', 200)).toBe(3);
  });

  it('rejects junk, zero, negatives and over-long decimals', () => {
    expect(parseCheckin('8.4km', 200)).toBeNull();
    expect(parseCheckin('0', 200)).toBeNull();
    expect(parseCheckin('-3', 200)).toBeNull();
    expect(parseCheckin('3.14159', 200)).toBeNull();
    expect(parseCheckin('', 200)).toBeNull();
    expect(parseCheckin(undefined, 200)).toBeNull();
  });

  it('caps at the allowed maximum', () => {
    expect(parseCheckin('300', 200)).toBeNull();
    expect(parseCheckin('199.99', 200)).toBe(199.99);
  });
});

describe('resolveLanguage', () => {
  it('maps amharic codes to am and everything else to en', () => {
    expect(resolveLanguage('am')).toBe('am');
    expect(resolveLanguage('am-ET')).toBe('am');
    expect(resolveLanguage('en')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage('fr')).toBe('en');
  });
});

describe('formatStartDate', () => {
  it('formats the Gregorian date in both languages', () => {
    expect(formatStartDate('2026-09-21', 'en')).toBe('September 21, 2026');
    expect(formatStartDate('2026-09-21', 'am')).toBe('መስከረም 21, 2026');
  });

  it('falls back to the raw value for invalid dates', () => {
    expect(formatStartDate('nonsense', 'en')).toBe('nonsense');
  });
});

describe('botMessages pre-launch copy', () => {
  it('uses the dynamic start date instead of a hardcoded one', () => {
    const en = botMessages.statusPreLaunch('en', 100, 'KM', 3, '2026-09-21');
    expect(en).toContain('September 21, 2026');
    const am = botMessages.statusPreLaunch('am', 100, 'KM', 3, '2026-09-21');
    expect(am).toContain('መስከረም 21, 2026');
    const day = botMessages.dayPreLaunch('en', 3, '2026-09-21');
    expect(day).toContain('September 21, 2026');
  });
});

describe('handleMessage', () => {
  const privateChat = { chat: { id: 2, type: 'private' }, from: { id: 111, language_code: 'en' } };

  it('ignores commands sent inside a group chat', async () => {
    await handlers.handleMessage({ chat: { id: -100123, type: 'supergroup' }, from: { id: 111 }, text: '/checkin 5' });
    expect(messenger.sendToChat).not.toHaveBeenCalled();
  });

  it('replies notLinked for unlinked users', async () => {
    await handlers.handleMessage({ ...privateChat, from: { id: 999, language_code: 'en' }, text: '/status' });
    expect(messenger.sendToChat).toHaveBeenCalledTimes(1);
    expect(messenger.sendToChat.mock.calls[0][1]).toContain("isn't linked");
  });

  it('does not claim the language was set when unlinked', async () => {
    await handlers.handleMessage({ ...privateChat, from: { id: 999, language_code: 'en' }, text: '/language am' });
    expect(messenger.sendToChat).toHaveBeenCalledTimes(1);
    expect(messenger.sendToChat.mock.calls[0][1]).toContain("isn't linked");
  });

  it('rejects junk /checkin input without logging', async () => {
    await handlers.handleMessage({ ...privateChat, text: '/checkin 8.4km' });
    expect(mockLogActivity).not.toHaveBeenCalled();
    expect(messenger.sendToChat).toHaveBeenCalledTimes(1);
    expect(messenger.sendToChat.mock.calls[0][1]).toContain('Usage:');
  });

  it('rejects an over-capped /checkin input', async () => {
    await handlers.handleMessage({ ...privateChat, text: '/checkin 5000' });
    expect(mockLogActivity).not.toHaveBeenCalled();
    expect(messenger.sendToChat.mock.calls[0][1]).toContain('Usage:');
  });

  it('logs a valid /checkin', async () => {
    await handlers.handleMessage({ ...privateChat, text: '/checkin 8.4' });
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    const arg = mockLogActivity.mock.calls[0][0];
    expect(arg.quantity).toBe(8.4);
    expect(arg.activityType).toBe('running');
  });

  it('welcomes back an already-linked member on a bare /start', async () => {
    await handlers.handleMessage({ ...privateChat, text: '/start' });
    expect(messenger.sendToChat).toHaveBeenCalledTimes(1);
    const text = messenger.sendToChat.mock.calls[0][1];
    const markup = messenger.sendToChat.mock.calls[0][2];
    expect(text).toContain('Welcome back');
    expect(text).toContain('Goal: <b>100 KM</b>');
    expect(markup).toBeDefined(); // group invite button present
  });

  it('keeps the link instructions for a bare /start from an unlinked user', async () => {
    await handlers.handleMessage({ ...privateChat, from: { id: 999, language_code: 'en' }, text: '/start' });
    expect(messenger.sendToChat).toHaveBeenCalledTimes(1);
    expect(messenger.sendToChat.mock.calls[0][1]).toContain('To link your account');
  });

  it('disconnects on /disconnect and clears the link', async () => {
    await handlers.handleMessage({ ...privateChat, text: '/disconnect' });
    expect(messenger.sendToChat).toHaveBeenCalledTimes(1);
    expect(messenger.sendToChat.mock.calls[0][1]).toContain('disconnected');
    expect(updates.some((u) => u.table === 'telegram_connections' && u.data.state === 'left')).toBe(true);
  });

  it('disconnects only inside a private chat', async () => {
    await handlers.handleMessage({ chat: { id: -100123, type: 'supergroup' }, from: { id: 111 }, text: '/disconnect' });
    expect(messenger.sendToChat).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});

describe('handleMyChatMember', () => {
  it('records left and kicked members as left/removed', async () => {
    await handlers.handleMyChatMember({ new_chat_member: { status: 'left', user: { id: 222, is_bot: false } } });
    expect(updates.some((u) => u.table === 'telegram_connections' && u.data.state === 'left')).toBe(true);
    updates.length = 0;
    await handlers.handleMyChatMember({ new_chat_member: { status: 'kicked', user: { id: 222, is_bot: false } } });
    expect(updates.some((u) => u.table === 'telegram_connections' && u.data.state === 'removed')).toBe(true);
  });

  it('ignores bot membership changes and unrelated statuses', async () => {
    await handlers.handleMyChatMember({ new_chat_member: { status: 'member', user: { id: 222, is_bot: false } } });
    await handlers.handleMyChatMember({ new_chat_member: { status: 'left', user: { id: 333, is_bot: true } } });
    expect(updates).toHaveLength(0);
  });
});