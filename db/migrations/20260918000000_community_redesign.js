// Community redesign foundation: normalized check-in posts, moderation status,
// challenge linkage, official announcements, and member reports.
exports.up = async function up(knex) {
  await knex.schema.alterTable('community_posts', (t) => {
    t.string('type', 30).notNullable().defaultTo('check_in');
    t.string('status', 20).notNullable().defaultTo('published');
    t.bigInteger('challenge_id').unsigned().nullable();
    t.bigInteger('enrollment_id').unsigned().nullable();
    t.string('activity_type', 30).nullable();
    t.decimal('distance', 10, 2).nullable();
    t.timestamp('updated_at').nullable();
  });

  await knex.schema.createTable('community_announcements', (t) => {
    t.bigIncrements('id').primary();
    t.string('title', 160).notNullable();
    t.text('body').nullable();
    t.bigInteger('challenge_id').unsigned().nullable();
    t.string('status', 20).notNullable().defaultTo('published');
    t.timestamp('pinned_at').nullable();
    t.timestamp('published_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['status', 'published_at']);
    t.foreign('challenge_id').references('id').inTable('challenges').onDelete('SET NULL');
  });

  await knex.schema.createTable('community_reports', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('post_id').unsigned().notNullable();
    t.bigInteger('reporter_id').unsigned().notNullable();
    t.string('reason', 300).nullable();
    t.string('status', 20).notNullable().defaultTo('open');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['post_id', 'reporter_id']);
    t.foreign('post_id').references('id').inTable('community_posts').onDelete('CASCADE');
    t.foreign('reporter_id').references('id').inTable('users').onDelete('CASCADE');
  });

  // Existing member posts become check-ins (compat — no data loss).
  await knex('community_posts').whereNull('type').update({ type: 'check_in' });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('community_reports');
  await knex.schema.dropTableIfExists('community_announcements');
  await knex.schema.alterTable('community_posts', (t) => {
    t.dropColumns('type', 'status', 'challenge_id', 'enrollment_id', 'activity_type', 'distance', 'updated_at');
  });
};