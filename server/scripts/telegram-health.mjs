// Telegram webhook health check (read-only). Prints the registered webhook,
// compares it to the expected BASE_URL path, and flags any errors/pending
// updates. Mirrors the boot-time self-check so you can re-run it anytime.
//
//   npm run telegram:health
import 'dotenv/config';
import { createHash } from 'node:crypto';

const { TELEGRAM_BOT_TOKEN, BASE_URL } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in server/.env');
  process.exit(1);
}

const secretToken = createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest('hex').slice(0, 32);
const botBase = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const res = await fetch(`${botBase}/getWebhookInfo`);
const { ok, result, description } = await res.json();

if (!ok) {
  console.error('getWebhookInfo failed:', description || 'unknown error');
  process.exit(1);
}

const expected = BASE_URL ? `${BASE_URL.replace(/\/$/, '')}/api/webhooks/telegram` : null;
let problems = 0;

console.log('Webhook URL    :', result.url || '(none)');
if (expected) {
  console.log('Expected URL   :', expected);
  if (result.url !== expected) {
    problems += 1;
    console.log('  ✗ MISMATCH — Telegram is delivering to a different URL.');
    console.log('  Fix: npm run telegram:setwebhook -- set ' + expected);
  } else {
    console.log('  ✓ matches');
  }
}

console.log('Secret token   :', secretToken);
console.log('Allowed updates:', (result.allowed_updates || []).join(', ') || '(none)');

if (result.last_error_message) {
  problems += 1;
  console.log('Last error     :', result.last_error_message, `(at ${new Date(result.last_error_date * 1000).toISOString()})`);
} else {
  console.log('Last error     : none ✓');
}

console.log('Pending updates:', result.pending_update_count ?? 0);
if ((result.pending_update_count ?? 0) > 0) {
  console.log('  (they will drain once the webhook URL is reachable)');
}

console.log(problems ? `\n${problems} problem(s) found.` : '\nAll good. ✓');
process.exit(problems ? 1 : 0);