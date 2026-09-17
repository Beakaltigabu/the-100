import 'dotenv/config';
import { createHash } from 'node:crypto';

const { TELEGRAM_BOT_TOKEN } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in server/.env');
  process.exit(1);
}

const secretToken = createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest('hex').slice(0, 32);
const base = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function set(url) {
  const qs = new URLSearchParams({
    url,
    secret_token: secretToken,
    allowed_updates: JSON.stringify(['message', 'edited_message', 'my_chat_member', 'chat_join_request'])
  });
  const res = await fetch(`${base}/setWebhook?${qs.toString()}`);
  console.log('secret_token:', secretToken);
  console.log(await res.json());
}

async function info() {
  const res = await fetch(`${base}/getWebhookInfo`);
  console.log(await res.json());
}

async function remove() {
  const res = await fetch(`${base}/deleteWebhook`);
  console.log(await res.json());
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case 'set':
    if (!arg) {
      console.error('Usage: telegram-setwebhook.mjs set <https://.../api/webhooks/telegram>');
      process.exit(1);
    }
    set(arg);
    break;
  case 'info':
    info();
    break;
  case 'remove':
    remove();
    break;
  default:
    console.log('Usage: node scripts/telegram-setwebhook.mjs set <https://.../api/webhooks/telegram> | info | remove');
    console.log('secret_token:', secretToken);
}