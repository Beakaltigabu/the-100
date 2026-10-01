// DB stress test against a managed MySQL (Aiven). Drives the app's REAL knex
// pool with realistic endpoint-style query mixes at a given concurrency, and
// monitors the server-side connection usage to prove the dedicated
// max_connections budget holds under the app's traffic.
//
// Usage (env: DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME/DB_SSL):
//   STRESS_SECONDS=20 STRESS_CONCURRENCY=50 node scripts/db-stress.cjs
process.env.NODE_ENV = 'development';

const db = require('../src/db');
const mysql = require('mysql2/promise');

const DURATION = Number(process.env.STRESS_SECONDS || 20);
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY || 50);

const MON = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};

// A realistic mix of the queries the app makes per request (progress,
// community stats, leaderboard, feed, notifications).
async function simulateRequest() {
  const u = await db('users').orderByRaw('RAND()').limit(1).first();
  if (!u) return;
  const e = await db('enrollments').where({ user_id: u.id }).orderBy('id', 'desc').first();
  if (e) {
    await db('challenge_activities').where({ enrollment_id: e.id }).sum({ s: 'quantity' }).first();
    await db('milestones').where({ enrollment_id: e.id }).orderBy('threshold', 'asc');
  }
  await db('enrollments').whereIn('status', ['committed', 'active']).countDistinct({ c: 'user_id' }).first();
  await db('challenge_activities').sum({ s: 'quantity' }).first();
  await db('challenge_activities')
    .join('enrollments', 'enrollments.id', 'challenge_activities.enrollment_id')
    .join('users', 'users.id', 'enrollments.user_id')
    .whereIn('enrollments.status', ['committed', 'active'])
    .groupBy('users.id')
    .select('users.id')
    .sum({ total: 'challenge_activities.quantity' })
    .orderBy('total', 'desc')
    .limit(10);
  await db('community_posts').where({ status: 'published' }).orderBy('created_at', 'desc').limit(10);
  await db('notifications').where({ user_id: u.id }).orderBy('created_at', 'desc').limit(5);
}

let completed = 0;
let errors = 0;
let err1040 = 0;
let running = true;
const lat = [];

async function worker() {
  while (running) {
    const t0 = Date.now();
    try {
      await simulateRequest();
      completed += 1;
      lat.push(Date.now() - t0);
    } catch (err) {
      errors += 1;
      if (err && (err.code === 'ER_CON_COUNT_ERROR' || Number(err.errno) === 1040)) err1040 += 1;
    }
  }
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function monitor(peak) {
  let c;
  try {
    c = await mysql.createConnection(MON);
    const [rows] = await c.query("SHOW STATUS WHERE Variable_name IN ('Threads_connected','Max_used_connections')");
    const m = {};
    for (const r of rows) m[r.Variable_name] = Number(r.Value);
    peak.threads = Math.max(peak.threads, m.Threads_connected || 0);
    peak.maxUsed = Math.max(peak.maxUsed, m.Max_used_connections || 0);
  } catch (err) {
    // monitoring connection itself may fail transiently — ignore
  } finally {
    if (c) await c.end().catch(() => {});
  }
}

async function main() {
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  const peak = { threads: 0, maxUsed: 0 };
  const mon = setInterval(() => monitor(peak).catch(() => {}), 2000);

  await new Promise((r) => setTimeout(r, DURATION * 1000));
  running = false;
  await Promise.all(workers);
  clearInterval(mon);

  const sorted = [...lat].sort((a, b) => a - b);
  const qps = completed / DURATION;
  const maxServer = Number(process.env.DB_SERVER_MAX_CONN || '?');
  console.log(`\n=== DB STRESS (${DURATION}s, concurrency ${CONCURRENCY}, pool max ${process.env.DB_POOL_MAX || 5}) ===`);
  console.log(`requests completed : ${completed}  (${qps.toFixed(1)} req/s)`);
  console.log(`avg latency        : ${Math.round(sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1))} ms`);
  console.log(`p50 / p95          : ${pct(sorted, 50)} / ${pct(sorted, 95)} ms`);
  console.log(`errors             : ${errors} (1040 "too many connections": ${err1040})`);
  console.log(`server connections : peak Threads_connected=${peak.threads}, Max_used_connections=${peak.maxUsed} (server max=${maxServer})`);
  await db.destroy();
  const ok = err1040 === 0 && errors === 0 && (maxServer === '?' || peak.threads < maxServer);
  console.log(ok ? '✓ HELD — no connection exhaustion, no errors.' : '✗ FAILED — see metrics above.');
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Stress failed:', err.message);
  await db.destroy().catch(() => {});
  process.exit(1);
});