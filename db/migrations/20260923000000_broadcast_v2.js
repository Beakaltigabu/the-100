// Broadcast v2 — full lifecycle, targeting, and delivery tracking.
// 1. broadcasts gains a status lifecycle (draft → scheduled → live → ended),
//    placement (app/landing/both), priority, scheduling, soft-delete, targeting.
// 2. broadcast_recipients records per-user/per-channel delivery.

exports.up = async function up(knex) {
  await knex.schema.alterTable('broadcasts', (t) => {
    t.string('status', 20).notNullable().defaultTo('draft');
    t.timestamp('scheduled_at').nullable();
    t.timestamp('published_at').nullable();
    t.timestamp('ended_at').nullable();
    t.timestamp('deleted_at').nullable();
    t.integer('priority').notNullable().defaultTo(0);
    t.string('placement', 20).notNullable().defaultTo('app');
    t.json('targeting').nullable();
  });

  await knex.schema.createTable('broadcast_recipients', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('broadcast_id').unsigned().notNullable();
    t.bigInteger('user_id').unsigned().nullable();
    t.string('channel', 20).notNullable();
    t.string('status', 20).notNullable().defaultTo('sent');
    t.string('error', 255).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['broadcast_id']);
    t.index(['user_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('broadcast_recipients');
  await knex.schema.alterTable('broadcasts', (t) => {
    t.dropColumn('status');
    t.dropColumn('scheduled_at');
    t.dropColumn('published_at');
    t.dropColumn('ended_at');
    t.dropColumn('deleted_at');
    t.dropColumn('priority');
    t.dropColumn('placement');
    t.dropColumn('targeting');
  });
};
