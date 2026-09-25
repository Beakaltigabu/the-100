const path = require('path');
const fs = require('fs');
const app = require('./app');
const config = require('./config');
const knex = require('./db');
const { startScheduler } = require('./services/scheduler');
const { ensureActiveChallenge } = require('./services/challenges');
const telegramMessenger = require('./services/telegramMessenger');
const { logErrorNow } = require('./services/logger');

// Best-effort crash capture into error_logs so failures are visible in the
// admin portal even when they take the process down.
if (process.env.NODE_ENV !== 'test') {
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err);
    logErrorNow({ level: 'error', source: 'process', message: err.message || String(err), stack: err.stack });
  });
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
    logErrorNow({
      level: 'error',
      source: 'process',
      message: reason && reason.message ? reason.message : String(reason),
      stack: reason && reason.stack ? reason.stack : null
    });
  });
}

// Resolves the migrations folder in both layouts: repo (../../db/migrations) and
// the deployed app-root (../db/migrations, where db/ sits next to src/).
function migrationsDir() {
  const candidates = [
    path.join(__dirname, '../../db/migrations'),
    path.join(__dirname, '../db/migrations')
  ];
  return candidates.find((dir) => fs.existsSync(dir)) || candidates[1];
}

// Warn loudly when the registered webhook no longer matches the configured
// BASE_URL (e.g. a stale ngrok tunnel) so the bot can't silently die.
async function checkWebhookHealth() {
  if (config.env === 'test' || !config.telegram.botToken) return;
  try {
    const info = await telegramMessenger.getWebhookInfo();
    if (!info) return;
    const expected = `${String(config.serverBase).replace(/\/$/, '')}/api/webhooks/telegram`;
    if (info.url !== expected) {
      console.warn(
        `[telegram] webhook is set to "${info.url}" but the app expects "${expected}".\n` +
          `[telegram] run: npm run telegram:setwebhook -- set ${expected}\n` +
          `[telegram] health: npm run telegram:health`
      );
    } else if (info.last_error_message || (info.pending_update_count ?? 0) > 0) {
      console.warn(
        `[telegram] webhook URL is correct but Telegram reports last_error="${info.last_error_message || 'none'}" ` +
          `and ${info.pending_update_count ?? 0} pending update(s).`
      );
    }
  } catch (err) {
    console.warn('[telegram] webhook health check failed:', err.message);
  }
}

async function boot() {
  // Deployment helper: apply knex migrations at boot when AUTO_MIGRATE=true.
  // Needed for cPanel File Manager-only deploys (no shell access). Set to false
  // after the first successful boot.
  if (process.env.AUTO_MIGRATE === 'true') {
    const dir = migrationsDir();
    console.log(`[migrate] applying knex migrations from ${dir}`);
    await knex.migrate.latest({ directory: dir });
    console.log('[migrate] done');
  }

  app.listen(config.port, () => {
    console.log(`THE 100 API listening on http://localhost:${config.port}`);
    if (process.env.TELEGRAM_DRY_RUN === 'true') {
      console.log('[telegram] TELEGRAM_DRY_RUN=true — sends will be logged, not delivered to Telegram.');
    }
    startScheduler();
    setTimeout(checkWebhookHealth, 2000);
  });

  // Self-heal: make sure the active challenge exists before anyone can enroll
  // (covers fresh schema imports, restarts, and accidental truncation).
  if (config.env !== 'test') {
    const seeded = await ensureActiveChallenge();
    console.log(`[challenge] active challenge ready: "${seeded.name}" (${seeded.start_date} → ${seeded.end_date})`);
  }
}

boot().catch((err) => {
  console.error('Boot failed:', err);
  process.exit(1);
});