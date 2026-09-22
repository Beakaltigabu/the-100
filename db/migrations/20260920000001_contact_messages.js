exports.up = async function up(knex) {
  await knex.schema.createTable('contact_messages', (t) => {
    t.bigIncrements('id').primary();
    t.string('name', 120).notNullable();
    t.string('email', 255).notNullable();
    t.text('message');
    t.bigInteger('user_id').unsigned().nullable();
    t.string('status', 20).notNullable().defaultTo('new');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('replied_at').nullable();
    t.timestamp('updated_at').nullable();
    t.index(['created_at']);
    t.index(['status']);
    t.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('contact_messages');
};