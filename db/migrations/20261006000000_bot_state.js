// Per-user bot flow state (multi-step flows: onboarding, logging, settings).
exports.up = async function up(knex) {
  await knex.schema.createTable('bot_state', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable().unique();
    t.json('state').nullable();
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('bot_state');
};