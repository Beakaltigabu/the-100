exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('password_hash', 255).nullable().alter();
    t.string('google_id', 64).nullable().unique();
    t.bigInteger('strava_uid').unsigned().nullable().unique();
    t.boolean('email_verified').notNullable().defaultTo(false);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('email_verified');
    t.dropColumn('strava_uid');
    t.dropColumn('google_id');
    t.string('password_hash', 255).notNullable().alter();
  });
};