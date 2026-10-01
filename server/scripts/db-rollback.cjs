// Roll back N migration steps on a schema (reversibility check), then manifest.
// Usage: node scripts/db-rollback.cjs [schema] [steps]  (defaults: the100_prodcopy, 1)
const path = require('path');
const knex = require('knex');
const { printManifest } = require('./db-manifest.cjs');

async function main() {
  const dbName = process.argv[2] || 'the100_prodcopy';
  const steps = Number(process.argv[3] || 1);
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
  const log = await db.migrate.rollback({ directory: dir, step: steps });
  console.log(`[rollback] reverted ${log.length} migration(s):`);
  for (const name of log) console.log('  -', name);
  await printManifest(dbName);
  await db.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Rollback failed:', err.message);
  process.exit(1);
});