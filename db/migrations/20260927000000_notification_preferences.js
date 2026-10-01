// Notification preferences — per-user opt-out per channel (web/telegram/push)
// and per notification type. Absent rows mean "enabled" (defaults on). Admin
// messages and nudges are force-delivered and ignore these preferences.
exports.up = async function up(knex) {
  await knex.schema.createTable('notification_preferences', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable();
    t.string('channel', 20).notNullable();
    t.string('type', 30).notNullable();
    t.boolean('enabled').notNullable().defaultTo(true);
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['user_id', 'channel', 'type']);
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('notification_preferences');
};