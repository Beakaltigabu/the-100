// Enforce the user_id foreign keys that were missing on these tables (data
// integrity + reliable ON DELETE CASCADE for account deletion).
// Idempotent: the init migration already created these FKs on fresh databases
// (knex auto-names them <table>_user_id_foreign), so re-adding them would fail
// with "Duplicate foreign key constraint name". Skip any table that already has
// a user FK instead of failing.

async function tableHasUserFk(knex, table) {
  const row = await knex('information_schema.TABLE_CONSTRAINTS')
    .whereRaw('CONSTRAINT_SCHEMA = DATABASE()')
    .where({ CONSTRAINT_TYPE: 'FOREIGN KEY', TABLE_NAME: table })
    .first();
  return !!row;
}

async function dropUserFk(knex, table) {
  const has = await tableHasUserFk(knex, table);
  if (!has) return;
  await knex.schema.alterTable(table, (t) => t.dropForeign('user_id'));
}

exports.up = async function up(knex) {
  for (const table of ['telegram_connections', 'strava_connections', 'notifications']) {
    if (await tableHasUserFk(knex, table)) continue;
    await knex.schema.alterTable(table, (t) => {
      t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }
};

exports.down = async function down(knex) {
  for (const table of ['telegram_connections', 'strava_connections', 'notifications']) {
    await dropUserFk(knex, table);
  }
};