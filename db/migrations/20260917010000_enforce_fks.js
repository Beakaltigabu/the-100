// Enforce the user_id foreign keys that were missing on these tables (data
// integrity + reliable ON DELETE CASCADE for account deletion).
exports.up = async function up(knex) {
  await knex.schema.alterTable('telegram_connections', (t) => {
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  await knex.schema.alterTable('strava_connections', (t) => {
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  await knex.schema.alterTable('notifications', (t) => {
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('telegram_connections', (t) => t.dropForeign('user_id'));
  await knex.schema.alterTable('strava_connections', (t) => t.dropForeign('user_id'));
  await knex.schema.alterTable('notifications', (t) => t.dropForeign('user_id'));
};