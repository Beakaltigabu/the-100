// One-time Strava backfill for ALL connected members from the challenge start.
// Runs on YOUR machine but executes on the prod server: it logs in as an admin
// and calls POST /api/admin/system/backfill-strava, which resets every
// connected member's sync window and triggers the Strava sync (idempotent).
//
// Credentials come from server/.env: ADMIN_EMAIL + ADMIN_PASSWORD.
import 'dotenv/config';

const BASE = (process.env.API_BASE_URL || process.env.BASE_URL || 'https://api.chooseyour100.com').replace(/\/$/, '');
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Missing ADMIN_EMAIL / ADMIN_PASSWORD in server/.env');
  process.exit(1);
}

function cookieHeader(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (!raw.length) {
    const single = res.headers.get('set-cookie');
    if (single) raw.push(single);
  }
  for (const c of raw) {
    const m = c.match(/(the100_token=[^;]+)/);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!login.ok) {
    const body = await login.text();
    console.error(`Login failed (${login.status}): ${body.slice(0, 200)}`);
    process.exit(1);
  }
  const cookie = cookieHeader(login);
  if (!cookie) {
    console.error('Login succeeded but no auth cookie was returned.');
    process.exit(1);
  }

  const res = await fetch(`${BASE}/api/admin/system/backfill-strava`, {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Backfill failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`\nStrava backfill (${BASE})`);
  console.log(JSON.stringify(data, null, 2));
  console.log('\nCheck activity: SELECT COUNT(*), MIN(date) FROM challenge_activities WHERE source=\'strava\';');
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill script error:', err.message);
  process.exit(1);
});