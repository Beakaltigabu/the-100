// Reports the prod server's public egress IP so it can be whitelisted in the
// cloud DB's allowlist (Aiven ip_filter / DigitalOcean trusted sources).
// Guarded by ADMIN_PROBE_SECRET (same as db-reach).
import 'dotenv/config';

const BASE = (process.env.API_BASE_URL || process.env.BASE_URL || 'https://api.chooseyour100.com').replace(/\/$/, '');
const secret = process.env.ADMIN_PROBE_SECRET;

if (!secret) {
  console.error('Missing ADMIN_PROBE_SECRET in server/.env (must match the cPanel env value).');
  process.exit(1);
}

async function main() {
  const res = await fetch(`${BASE}/api/health/egress-ip`, { headers: { 'X-Admin-Probe': secret } });
  const data = await res.json().catch(() => ({}));
  console.log(`\nProd server egress IP → ${data.egressIp || '(unknown)'}`);
  console.log('Whitelist this IP in the cloud DB allowlist (e.g. Aiven ip_filter / DO trusted sources).');
  process.exit(data.egressIp ? 0 : 1);
}

main().catch((err) => {
  console.error('db-egress error:', err.message);
  process.exit(1);
});