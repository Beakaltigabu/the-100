// Load-test the API's hot endpoints with autocannon.
//
//   DISABLE_RATE_LIMIT=true npm run dev   # in one terminal (accurate numbers; dev only)
//   npm run loadtest                       # in another
//
// Env: LOAD_URL (default http://localhost:4000), LOAD_DURATION (s), LOAD_CONNECTIONS.
import autocannon from 'autocannon';

const BASE = process.env.LOAD_URL || 'http://localhost:4000';
const DURATION = Number(process.env.LOAD_DURATION || 5);
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS || 20);
const EMAIL = `load_${Date.now()}@the100.app`;
const PASSWORD = 'password123';

async function getCookie() {
  await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Load User', email: EMAIL, password: PASSWORD })
  });
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const setCookie = res.headers.get('set-cookie') || '';
  return setCookie.split(';')[0];
}

function bench(name, path, cookie) {
  return new Promise((resolve) => {
    autocannon(
      {
        url: `${BASE}${path}`,
        headers: cookie ? { Cookie: cookie } : {},
        connections: CONNECTIONS,
        duration: DURATION
      },
      (err, result) => {
        if (err) {
          console.error(`${name}: ERROR ${err.message}`);
          return resolve();
        }
        const rps = Math.round(result.requests.average);
        const latency = result.latency || {};
        const p50 = Math.round(latency.p50 ?? 0);
        const p90 = Math.round(latency.p90 ?? latency.p97_5 ?? 0);
        const p99 = Math.round(latency.p99 ?? latency.p97_5 ?? 0);
        console.log(
          `${name.padEnd(24)} ${String(rps).padStart(7)} req/s | p50 ${String(p50).padStart(4)}ms  p90 ${String(p90).padStart(4)}ms  p99 ${String(p99).padStart(4)}ms | non-2xx ${result.non2xx}`
        );
        resolve();
      }
    );
  });
}

(async () => {
  console.log(`Load testing ${BASE} (${CONNECTIONS} connections, ${DURATION}s each)\n`);
  const cookie = await getCookie();
  await bench('/api/health', '/api/health', null);
  await bench('/api/challenges/next', '/api/challenges/next', null);
  await bench('/api/me', '/api/me', cookie);
  await bench('/api/progress', '/api/progress', cookie);
  await bench('/api/community/feed', '/api/community/feed', cookie);
  console.log('\nNote: the script creates a throwaway load_*@the100.app user; delete it from your dev DB if desired.');
  process.exit(0);
})().catch((e) => {
  console.error('Load test failed:', e.message);
  process.exit(1);
});