// Server-side DB connection test: calls POST /api/health/db-test ON the prod
// server, which connects using the app's real DB pool (whatever DB_* the server
// env points at, e.g. AletCloud). Run this AFTER the server is deployed with
// DB_* pointed at the target DB.
//
// Guarded by ADMIN_PROBE_SECRET (same as db-reach/db-egress).
import 'dotenv/config';

const BASE = (process.env.API_BASE_URL || process.env.BASE_URL || 'https://api.chooseyour100.com').replace(/\/$/, '');
const secret = process.env.ADMIN_PROBE_SECRET;

if (!secret) {
  console.error('Missing ADMIN_PROBE_SECRET in server/.env (must match the cPanel env value).');
  process.exit(1);
}

async function main() {
  const res = await fetch(`${BASE}/api/health/db-test`, {
    method: 'POST',
    headers: { 'X-Admin-Probe': secret }
  });
  const data = await res.json().catch(() => ({}));
  console.log(`\nServer DB connection test → ${BASE}`);
  console.log(JSON.stringify(data, null, 2));
  if (data.ok) {
    console.log('✓ CONNECTED — the prod server can use this database.');
  } else {
    console.log('✗ FAILED — see code/detail above (e.g. ETIMEDOUT = host blocked/unreachable; ER_ACCESS_DENIED_ERROR = auth).');
  }
  process.exit(data.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('db-test error:', err.message);
  process.exit(1);
});