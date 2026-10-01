// Integration-test DB harness. MUST be imported before any app module so the
// env is set before `config`/`db` are created at require-time.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'the100_test';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
process.env.TELEGRAM_DRY_RUN = 'true';
process.env.TELEGRAM_SEND_DELAY = '0';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-do-not-use-2026';
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
// A fake group id so the community-group paths are exercised in dry-run. The bot
// MUST only ever send here (no-HQ guard is asserted by the group tests).
process.env.TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '-1000000000001';
process.env.TELEGRAM_GROUP_LINK = process.env.TELEGRAM_GROUP_LINK || 'https://t.me/test100community';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '123456:integration-test-token';

const path = require('path');
const mysql = require('mysql2/promise');
const db = require('../../src/db');
const { todayISO, addDaysISO } = require('../../src/lib/dates');

const DB_NAME = process.env.DB_NAME;
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../db/migrations');
let provisioned = false;

const RESET_TABLES = [
  // content / community
  'community_posts',
  'community_cheers',
  'post_cheers',
  'community_comments',
  'community_bookmarks',
  'community_follows',
  'community_reports',
  'community_announcements',
  'community_challenges',
  'community_challenge_participants',
  // events / broadcasts / badges
  'events',
  'event_participants',
  'broadcasts',
  'broadcast_recipients',
  'badges',
  'user_badges',
  // notifications / prefs / push
  'notifications',
  'notification_preferences',
  'push_subscriptions',
  // bot
  'bot_state',
  'bot_settings',
  // integrations
  'strava_connections',
  'telegram_connections',
  'password_reset_tokens',
  // challenge data
  'challenge_activities',
  'milestones',
  'enrollments',
  'users',
  // support
  'contact_messages',
  // observability (dry-run capture)
  'event_logs'
];

async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
}

async function provision() {
  if (provisioned) return;
  await ensureDatabase();
  await db.migrate.latest({ directory: MIGRATIONS_DIR });
  await seedChallenge();
  provisioned = true;
}

async function seedChallenge() {
  const existing = await db('challenges').where({ is_active: true }).first();
  if (existing) return existing;
  const start = addDaysISO(todayISO(), -5);
  const end = addDaysISO(start, 95);
  const [id] = await db('challenges').insert({
    name: 'THE 100 — TEST',
    description: 'Integration-test challenge',
    start_date: start,
    end_date: end,
    is_active: true
  });
  return { id, start_date: start, end_date: end, is_active: true };
}

async function getActiveChallenge() {
  return db('challenges').where({ is_active: true }).first();
}

// Wipe all test data (keeps the migrated schema + challenge row). Call in
// beforeEach so every test starts clean.
async function reset() {
  await provision();
  await db.raw('SET FOREIGN_KEY_CHECKS = 0');
  await db('meta').where('meta_key', 'like', 'bot_%').del();
  await db('meta').where('meta_key', 'like', 'digest_%').del();
  for (const t of RESET_TABLES) {
    await db(t).del();
  }
  await db.raw('SET FOREIGN_KEY_CHECKS = 1');
  const { clearActiveChallengeCache } = require('../../src/services/challengeWindow');
  clearActiveChallengeCache();
}

async function destroy() {
  await db.destroy();
}

module.exports = { provision, reset, destroy, getActiveChallenge, seedChallenge, DB_NAME, db };