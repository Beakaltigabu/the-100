import 'dotenv/config';

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_VERIFY_TOKEN } = process.env;
const API = 'https://www.strava.com/api/v3';

function requireCreds() {
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_VERIFY_TOKEN) {
    console.error('Missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET / STRAVA_VERIFY_TOKEN in server/.env');
    process.exit(1);
  }
}

async function list() {
  const url = `${API}/push_subscriptions?client_id=${STRAVA_CLIENT_ID}&client_secret=${STRAVA_CLIENT_SECRET}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(res.ok ? JSON.stringify(data, null, 2) : `Error ${res.status}: ${JSON.stringify(data)}`);
}

async function create(callbackUrl) {
  const res = await fetch(`${API}/push_subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: STRAVA_VERIFY_TOKEN
    })
  });
  const data = await res.json();
  console.log(
    res.ok
      ? `Subscription created: ${JSON.stringify(data)}`
      : `Error ${res.status}: ${JSON.stringify(data)}`
  );
}

async function remove(id) {
  const url = `${API}/push_subscriptions/${id}?client_id=${STRAVA_CLIENT_ID}&client_secret=${STRAVA_CLIENT_SECRET}`;
  const res = await fetch(url, { method: 'DELETE' });
  console.log(res.ok ? `Deleted subscription ${id}` : `Error ${res.status}`);
}

const [cmd, arg] = process.argv.slice(2);
requireCreds();
switch (cmd) {
  case 'create':
    if (!arg) {
      console.error('Usage: strava-subscribe.mjs create <https://callback_url>');
      process.exit(1);
    }
    create(arg);
    break;
  case 'list':
    list();
    break;
  case 'delete':
    remove(arg);
    break;
  default:
    console.log('Usage: node scripts/strava-subscribe.mjs create <https://callback_url> | list | delete <id>');
}