exports.up = async function up(knex) {
  await knex.schema.createTable('community_posts', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable();
    t.text('body').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.index(['created_at']);
  });

  await knex.schema.createTable('post_cheers', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('post_id').unsigned().notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['post_id', 'user_id']);
    t.foreign('post_id').references('id').inTable('community_posts').onDelete('CASCADE');
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('post_cheers');
  await knex.schema.dropTableIfExists('community_posts');
};