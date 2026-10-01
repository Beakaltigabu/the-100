// Safety rail for throwaway smoke/E2E scripts that write to or delete from the
// database. Destructive scripts must target a dedicated test database (name
// ending in "_test") or the operator must explicitly opt in with
// ALLOW_DESTRUCTIVE=true. Without this, a carelessly-run script can erase real
// data — e.g. the throwaway scripts that once ran `db('broadcasts').del()`
// against the local DB and wiped every broadcast record.
const dbName = String(process.env.DB_NAME || '');
const isTestDb = dbName.endsWith('_test');

if (!isTestDb && process.env.ALLOW_DESTRUCTIVE !== 'true') {
  console.error(
    `[guard-test-db] Refusing to run against DB "${dbName || '<unset>'}" — this script writes/deletes data.\n` +
      'Point DB_NAME at a *_test database, or set ALLOW_DESTRUCTIVE=true to run against a real DB.'
  );
  process.exit(1);
}

module.exports = { isTestDb, dbName };