// Community challenges — shared goals with optional participation + progress.
exports.up = async function up(knex) {
  await knex.schema.createTable('community_challenges', (t) => {
    t.bigIncrements('id').primary();
    t.string('title', 120).notNullable();
    t.string('description', 300).nullable();
    t.decimal('goal_value', 10, 2).notNullable();
    t.string('goal_unit', 10).notNullable().defaultTo('km');
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.string('status', 20).notNullable().defaultTo('active');
    t.bigInteger('created_by').unsigned().nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.createTable('community_challenge_participants', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('challenge_id').unsigned().notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['challenge_id', 'user_id']);
    t.foreign('challenge_id').references('id').inTable('community_challenges').onDelete('CASCADE');
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('community_challenge_participants');
  await knex.schema.dropTableIfExists('community_challenges');
};