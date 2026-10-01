const path = require('path');
const fs = require('fs');
const app = require('./app');
const config = require('./config');
const knex = require('./db');
const { startScheduler } = require('./services/scheduler');
const { ensureActiveChallenge } = require('./services/challenges');
const telegramMessenger = require('./services/telegramMessenger');
const { logErrorNow } = require('./services/logger');
const { alertAdmins } = require('./services/adminAlerts');

// Best-effort crash capture into error_logs so failures are visible in the
// admin portal even when they take the process down.
if (process.env.NODE_ENV !== 'test') {
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err);
    logErrorNow({ level: 'error', source: 'process', message: err.message || String(err), stack: err.stack });
    alertAdmins(`Unexpected process error: ${err.message || String(err)}`, { category: 'process' }).catch(() => {});
  });
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
    logErrorNow({
      level: 'error',
      source: 'process',
      message: reason && reason.message ? reason.message : String(reason),
      stack: reason && reason.stack ? reason.stack : null
    });
    alertAdmins(`Unhandled rejection: ${reason && reason.message ? reason.message : String(reason)}`, { category: 'process' }).catch(() => {});
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
    } else if ((info.pending_update_count ?? 0) > 0) {
      // Only warn when Telegram is actively failing to deliver (pending updates
      // stuck). A stale `last_error` with 0 pending is historical noise — ignore.
      console.warn(
        `[telegram] webhook has ${info.pending_update_count} pending update(s) — last_error="${info.last_error_message || 'none'}"`
      );
      alertAdmins(`Telegram webhook is down — ${info.pending_update_count} pending update(s).`, { category: 'webhook' }).catch(() => {});
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
    // A cPanel restart can race the first boot while the migration table is
    // still locked (the process was killed mid-run). Retry briefly before giving
    // up, so a transient lock self-heals instead of taking the app down.
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await knex.migrate.latest({ directory: dir });
        break;
      } catch (err) {
        const locked = err && /MigrationLocked|already locked/i.test(String(err.message || err));
        if (locked && attempt < MAX_ATTEMPTS) {
          console.warn(`[migrate] migration table locked (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in 10s…`);
          await new Promise((r) => setTimeout(r, 10000));
          continue;
        }
        if (locked) {
          console.error('[migrate] migration table is still locked after retries.');
          console.error('Release it in the DB: UPDATE knex_migrations_lock SET is_locked = 0; then restart.');
          alertAdmins('MIGRATION LOCKED — the app cannot start.\nRelease it: UPDATE knex_migrations_lock SET is_locked = 0; then restart.', { category: 'migration' }).catch(() => {});
        }
        throw err;
      }
    }
    console.log('[migrate] done');
  }

  const server = app.listen(config.port, () => {
    console.log(`THE 100 API listening on http://localhost:${config.port}`);
    if (process.env.TELEGRAM_DRY_RUN === 'true') {
      console.log('[telegram] TELEGRAM_DRY_RUN=true — sends will be logged, not delivered to Telegram.');
    }
    startScheduler();
    setTimeout(checkWebhookHealth, 2000);
  });

  // Graceful shutdown: cPanel stop/restart sends SIGTERM. Releasing the server +
  // knex pool here means every restart frees its DB connections immediately
  // instead of leaving idle connections piling up on the (shared) MySQL server.
  let shuttingDown = false;
  const graceful = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — closing HTTP server + DB pool…`);
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      await knex.destroy();
      process.exit(0);
    } catch (err) {
      console.error('[shutdown] error:', err.message);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => graceful('SIGTERM'));
  process.on('SIGINT', () => graceful('SIGINT'));

  // Self-heal: make sure the active challenge exists before anyone can enroll
  // (covers fresh schema imports, restarts, and accidental truncation). Never
  // fatal — a temporary DB hiccup must not take the whole server down.
  if (config.env !== 'test') {
    try {
      const seeded = await ensureActiveChallenge();
      console.log(`[challenge] active challenge ready: "${seeded.name}" (${seeded.start_date} → ${seeded.end_date})`);
    } catch (err) {
      console.warn(`[challenge] could not verify the active challenge at boot: ${err.message}`);
    }
  }
}

boot().catch((err) => {
  console.error('Boot failed:', err);
  alertAdmins(`BOOT FAILED: ${err.message || String(err)}`, { category: 'boot' }).catch(() => {});
  process.exit(1);
});