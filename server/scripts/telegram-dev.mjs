// Local dev helper: start an ngrok tunnel to the API and register it as the
// Telegram webhook so you can test the bot from localhost.
//
//   npm run telegram:dev            (tunnel http://localhost:4000)
//   npm run telegram:dev -- 3000    (custom API port)
//
// Requires `ngrok` on PATH (https://ngrok.com/download). Exits cleanly with
// instructions if it's not installed.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const PORT = process.argv[2] || process.env.PORT || '4000';
const { TELEGRAM_BOT_TOKEN } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in server/.env');
  process.exit(1);
}

// Safety: webhook testing re-registers the bot's webhook to this tunnel. Never
// point this at the PRODUCTION bot. Use a dedicated TEST bot token, and disable
// dry-run so messages actually deliver.
if (process.env.TELEGRAM_DRY_RUN === 'true') {
  console.error(
    '\nTELEGRAM_DRY_RUN=true is set — messages will not actually send, so webhook\n' +
      'testing will not exercise real delivery.\n\n' +
      'Set TELEGRAM_DRY_RUN=false and TELEGRAM_BOT_TOKEN to a TEST bot token\n' +
      '(created via @BotFather) before running this. NEVER use the production token.\n'
  );
  process.exit(1);
}
console.log('⚠️  Use a TEST bot token (not production). This re-registers the webhook.');

const secretToken = createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest('hex').slice(0, 32);
const botBase = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function setWebhook(url) {
  const qs = new URLSearchParams({
    url: `${url}/api/webhooks/telegram`,
    secret_token: secretToken,
    allowed_updates: JSON.stringify(['message', 'edited_message', 'my_chat_member', 'chat_join_request'])
  });
  const res = await fetch(`${botBase}/setWebhook?${qs.toString()}`);
  const json = await res.json();
  if (!json.ok) {
    console.error('setWebhook failed:', JSON.stringify(json));
    process.exit(1);
  }
  console.log(`\nWebhook registered: ${url}/api/webhooks/telegram`);
  console.log('Test the bot in Telegram now. Ctrl+C to stop.');
}

const tunnel = spawn('ngrok', ['http', PORT], { stdio: 'inherit' });

tunnel.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error(
      '\nngrok was not found on PATH.\n\nInstall it (https://ngrok.com/download) or download the binary, then re-run:\n  npm run telegram:dev'
    );
    process.exit(1);
  }
  throw err;
});

tunnel.on('exit', () => process.exit(0));

async function pollTunnel() {
  const deadline = Date.now() + 30 * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:4040/api/tunnels');
      const { tunnels } = await res.json();
      const https = (tunnels || []).find((t) => t.proto === 'https' && t.public_url);
      if (https) {
        await setWebhook(https.public_url.replace(/\/$/, ''));
        return;
      }
    } catch {
      /* ngrok API not ready yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('\nTimed out waiting for the ngrok tunnel. Is ngrok running?');
  process.exit(1);
}

pollTunnel();