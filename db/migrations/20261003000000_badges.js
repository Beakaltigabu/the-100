// Badges & achievements — static definitions + per-user earned rows.
exports.up = async function up(knex) {
  await knex.schema.createTable('badges', (t) => {
    t.bigIncrements('id').primary();
    t.string('code', 40).notNullable().unique();
    t.string('name', 80).notNullable();
    t.string('icon', 8).notNullable();
    t.string('description', 200).notNullable();
  });

  await knex.schema.createTable('user_badges', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable();
    t.bigInteger('badge_id').unsigned().notNullable();
    t.timestamp('earned_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['user_id', 'badge_id']);
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.foreign('badge_id').references('id').inTable('badges').onDelete('CASCADE');
  });

  await knex('badges').insert([
    { code: 'first_check_in', name: 'First Check-in', icon: '🏃', description: 'Logged your first activity.' },
    { code: 'streak_7', name: '7-Day Streak', icon: '🔥', description: 'Logged 7 days in a row.' },
    { code: 'first_milestone', name: 'First Milestone', icon: '🎯', description: 'Hit your first milestone.' },
    { code: 'finisher', name: 'Finisher', icon: '🏁', description: 'Finished your 100.' }
  ]);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('user_badges');
  await knex.schema.dropTableIfExists('badges');
};