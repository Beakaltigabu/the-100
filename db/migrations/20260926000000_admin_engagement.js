// Admin engagement + install + notes + session tracking.
// 1. users gains pwa_installed/installed_at (PWA install detection) and notes
//    (admin annotations).
// 2. session_logs records client heartbeats so "time on platform" is measurable.

exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('pwa_installed').notNullable().defaultTo(false);
    t.timestamp('installed_at').nullable();
    t.text('notes').nullable();
  });

  await knex.schema.createTable('session_logs', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable();
    t.string('session_id', 64).notNullable();
    t.timestamp('started_at').notNullable();
    t.timestamp('last_heartbeat_at').notNullable();
    t.integer('duration_seconds').notNullable().defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['user_id', 'last_heartbeat_at']);
    t.index(['session_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('session_logs');
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('pwa_installed');
    t.dropColumn('installed_at');
    t.dropColumn('notes');
  });
};
