// Comments on community items (keyed by normalized item id, like cheers).
exports.up = async function up(knex) {
  await knex.schema.createTable('community_comments', (t) => {
    t.bigIncrements('id').primary();
    t.string('item_key', 200).notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.text('body').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['item_key']);
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('community_comments');
};