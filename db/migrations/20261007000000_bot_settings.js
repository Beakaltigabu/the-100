// Per-user THE 100 BOT notification settings.
exports.up = async function up(knex) {
  await knex.schema.createTable('bot_settings', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable().unique();
    t.boolean('milestones_on').notNullable().defaultTo(true);
    t.boolean('weekly_on').notNullable().defaultTo(true);
    t.boolean('community_on').notNullable().defaultTo(true);
    t.string('reminders_mode', 20).notNullable().defaultTo('occasionally');
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('bot_settings');
};