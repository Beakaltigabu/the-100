// Web push subscriptions — one row per browser push endpoint per user.
exports.up = async function up(knex) {
  await knex.schema.createTable('push_subscriptions', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable();
    t.string('endpoint', 500).notNullable();
    t.string('p256dh', 255).notNullable();
    t.string('auth', 255).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['endpoint']);
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('push_subscriptions');
};