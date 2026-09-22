// Generic cheers keyed by normalized community item id, so milestones, finishes,
// joins, and check-ins can all be cheered (not only community_posts).
exports.up = async function up(knex) {
  await knex.schema.createTable('community_cheers', (t) => {
    t.bigIncrements('id').primary();
    t.string('item_key', 200).notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['item_key', 'user_id']);
    t.index(['item_key']);
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('community_cheers');
};