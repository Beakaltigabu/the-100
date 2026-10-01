// Follow relationships for a personalized community feed.
exports.up = async function up(knex) {
  await knex.schema.createTable('community_follows', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('follower_id').unsigned().notNullable();
    t.bigInteger('following_id').unsigned().notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['follower_id', 'following_id']);
    t.index(['following_id']);
    t.foreign('follower_id').references('id').inTable('users').onDelete('CASCADE');
    t.foreign('following_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('community_follows');
};