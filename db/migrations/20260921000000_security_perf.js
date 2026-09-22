// Pre-deployment hardening:
// 1. users.token_version — session invalidation on password reset/change.
// 2. Composite index for the community feed hot query
//    (type + status + challenge_id, ordered by created_at).
// 3. enrollments ordering indexes used by feed finishers/joins queries.
// 4. Drops indexes made redundant by the above.
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.integer('token_version').notNullable().defaultTo(0);
  });

  await knex.schema.alterTable('community_posts', (t) => {
    t.index(['type', 'status', 'challenge_id', 'created_at'], 'community_posts_feed_idx');
    // Single-column created_at is covered by the composite for feed queries.
    t.dropIndex(['created_at']);
  });

  await knex.schema.alterTable('enrollments', (t) => {
    t.index('completed_at');
    t.index('created_at');
  });

  await knex.schema.alterTable('community_cheers', (t) => {
    // Covered by the leftmost column of the unique (item_key, user_id) index.
    t.dropIndex(['item_key']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('community_cheers', (t) => {
    t.index(['item_key']);
  });

  await knex.schema.alterTable('enrollments', (t) => {
    t.dropIndex('completed_at');
    t.dropIndex('created_at');
  });

  await knex.schema.alterTable('community_posts', (t) => {
    t.index(['created_at']);
    t.dropIndex([], 'community_posts_feed_idx');
  });

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('token_version');
  });
};
