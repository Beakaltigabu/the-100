// Print a row-count manifest (COUNT(*) per table) for a schema.
// Usage: node scripts/db-manifest.cjs [schema]  (default: the100_prodcopy)
const mysql = require('mysql2/promise');

async function printManifest(dbName, { label } = {}) {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });
  const [tables] = await c.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name NOT IN ('knex_migrations','knex_migrations_lock') ORDER BY table_name`,
    [dbName]
  );
  const counts = {};
  for (const row of tables) {
    const t = row.table_name ?? row.TABLE_NAME ?? Object.values(row)[0];
    const [r] = await c.query(`SELECT COUNT(*) AS c FROM \`${dbName}\`.\`${t}\``);
    counts[t] = Number(r[0].c);
  }
  await c.end();
  console.log(`\n${label ? label + ' — ' : ''}manifest \`${dbName}\` (${tables.length} tables):`);
  for (const [t, n] of Object.entries(counts)) {
    if (n > 0) console.log(`  ${t}: ${n}`);
  }
  return counts;
}

async function main() {
  const dbName = process.argv[2] || 'the100_prodcopy';
  await printManifest(dbName);
  process.exit(0);
}

module.exports = { printManifest };

if (require.main === module) {
  main().catch((err) => {
    console.error('Manifest failed:', err.message);
    process.exit(1);
  });
}