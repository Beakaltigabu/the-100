// Bookmarks ("save") on community items, keyed by normalized item id.
exports.up = async function up(knex) {
  await knex.schema.createTable('community_bookmarks', (t) => {
    t.bigIncrements('id').primary();
    t.string('item_key', 200).notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['item_key', 'user_id']);
    t.index(['user_id']);
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('community_bookmarks');
};