exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('strava_uid');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.bigInteger('strava_uid').unsigned().nullable().unique();
  });
};