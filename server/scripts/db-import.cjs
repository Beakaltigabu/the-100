// Import a MySQL/MariaDB dump into a fresh local schema and print a row-count
// manifest. Disposable copies only — never point this at live data.
//
// Usage: node scripts/db-import.cjs <dump.sql[.gz]> [schema]
//   default schema: the100_prodcopy
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { printManifest } = require('./db-manifest.cjs');

async function main() {
  const [, , fileArg, dbArg] = process.argv;
  const dbName = dbArg || 'the100_prodcopy';
  if (!fileArg) {
    console.error('Usage: node scripts/db-import.cjs <dump.sql[.gz]> [schema]');
    process.exit(1);
  }
  const dumpFile = path.resolve(fileArg);
  if (!fs.existsSync(dumpFile)) {
    console.error('Dump not found:', dumpFile);
    process.exit(1);
  }

  const c = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  console.log(`Dropping + recreating \`${dbName}\` (fresh disposable copy)...`);
  await c.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await c.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.changeUser({ database: dbName });

  const raw = dumpFile.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(dumpFile)) : fs.readFileSync(dumpFile);
  console.log(`Importing ${dumpFile} (${(raw.length / 1024 / 1024).toFixed(2)} MB)...`);
  await c.query(raw.toString('utf8'));
  await c.end();
  console.log(`Imported -> \`${dbName}\``);

  await printManifest(dbName);
  process.exit(0);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});