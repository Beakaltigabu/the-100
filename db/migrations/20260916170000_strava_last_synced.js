exports.up = async function up(knex) {
  await knex.schema.alterTable('strava_connections', (t) => {
    t.timestamp('last_synced_at').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('strava_connections', (t) => {
    t.dropColumn('last_synced_at');
  });
};