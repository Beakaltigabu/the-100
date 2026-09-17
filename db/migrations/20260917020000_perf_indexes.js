// Performance indexes for the hot query paths (confirmed full scans via EXPLAIN).
exports.up = async function up(knex) {
  await knex.schema.alterTable('telegram_connections', (t) => {
    t.index('telegram_user_id');
    t.index('link_token_hash');
  });
  await knex.schema.alterTable('strava_connections', (t) => {
    t.index('strava_athlete_id');
  });
  await knex.schema.alterTable('challenge_activities', (t) => {
    t.index('date');
  });
  await knex.schema.alterTable('milestones', (t) => {
    t.index('reached_at');
  });
  await knex.schema.alterTable('enrollments', (t) => {
    t.index('status');
  });
  await knex.schema.alterTable('notifications', (t) => {
    t.index(['user_id', 'created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('telegram_connections', (t) => {
    t.dropIndex('telegram_user_id');
    t.dropIndex('link_token_hash');
  });
  await knex.schema.alterTable('strava_connections', (t) => {
    t.dropIndex('strava_athlete_id');
  });
  await knex.schema.alterTable('challenge_activities', (t) => {
    t.dropIndex('date');
  });
  await knex.schema.alterTable('milestones', (t) => {
    t.dropIndex('reached_at');
  });
  await knex.schema.alterTable('enrollments', (t) => {
    t.dropIndex('status');
  });
  await knex.schema.alterTable('notifications', (t) => {
    t.dropIndex(['user_id', 'created_at']);
  });
};