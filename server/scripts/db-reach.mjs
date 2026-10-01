// Phase-0 diagnostic: check whether the PROD server (cPanel) can reach a target
// MySQL host (e.g. the Aiven cloud DB). Calls POST /api/health/db-reach ON the
// server, guarded by ADMIN_PROBE_SECRET (must be set in BOTH server/.env and
// the cPanel env), so it measures the real cPanel -> cloud-DB path without
// needing the admin login.
//
// Usage: node scripts/db-reach.mjs <host> [port]
import 'dotenv/config';

const BASE = (process.env.API_BASE_URL || process.env.BASE_URL || 'https://api.chooseyour100.com').replace(/\/$/, '');
const secret = process.env.ADMIN_PROBE_SECRET;
const host = process.argv[2];
const port = Number(process.argv[3] || 3306);

if (!host) {
  console.error('Usage: node scripts/db-reach.mjs <host> [port]');
  process.exit(1);
}
if (!secret) {
  console.error('Missing ADMIN_PROBE_SECRET in server/.env (must match the cPanel env value).');
  process.exit(1);
}

async function main() {
  const res = await fetch(`${BASE}/api/health/db-reach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Probe': secret },
    body: JSON.stringify({ host, port })
  });
  const data = await res.json().catch(() => ({}));
  console.log(`\nMySQL reachability from prod server → ${host}:${port}`);
  console.log(JSON.stringify(data, null, 2));
  if (!res.ok && !data.reachable) {
    console.error(`(HTTP ${res.status} — ${data.error || 'see detail'})`);
  }
  process.exit(data.reachable ? 0 : 1);
}

main().catch((err) => {
  console.error('db-reach error:', err.message);
  process.exit(1);
});