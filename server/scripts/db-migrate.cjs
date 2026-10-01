// Apply the pending knex migrations to a schema, then print the manifest.
// Usage: node scripts/db-migrate.cjs [schema]  (default: the100_prodcopy)
const path = require('path');
const knex = require('knex');
const { printManifest } = require('./db-manifest.cjs');

async function main() {
  const dbName = process.argv[2] || 'the100_prodcopy';
  const db = knex({
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: dbName,
      charset: 'utf8mb4',
      dateStrings: true
    }
  });
  const dir = path.resolve(__dirname, '../../db/migrations');
  const before = await printManifest(dbName, { label: 'BEFORE migration' });
  const [batch, log] = await db.migrate.latest({ directory: dir });
  console.log(`\n[migrate] batch ${batch}: ${log.length} migration(s) applied`);
  for (const name of log) console.log('  +', name);
  const after = await printManifest(dbName, { label: 'AFTER migration' });

  // Data-loss check: every pre-existing table must have identical row counts.
  let changed = false;
  for (const [t, n] of Object.entries(before)) {
    if (after[t] !== undefined && after[t] !== n) {
      changed = true;
      console.log(`  ⚠ DATA CHANGE ${t}: ${n} -> ${after[t]}`);
    }
  }
  if (changed) {
    console.error('\n✗ Row counts changed on existing tables — DO NOT deploy.');
    process.exit(1);
  }
  console.log('\n✓ All existing tables preserved (row counts identical).');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migrate failed:', err.message);
  process.exit(1);
});