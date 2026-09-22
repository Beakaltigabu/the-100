exports.up = async function up(knex) {
  await knex.schema.createTable('request_logs', (t) => {
    t.bigIncrements('id').primary();
    t.string('method', 10).notNullable();
    t.string('path', 255).notNullable();
    t.smallint('status').notNullable();
    t.integer('duration_ms').notNullable().defaultTo(0);
    t.string('ip', 64).nullable();
    t.string('user_agent', 255).nullable();
    t.bigInteger('user_id').unsigned().nullable();
    t.string('source', 20).notNullable().defaultTo('web');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['created_at']);
    t.index(['path']);
    t.index(['status']);
    t.index(['source']);
    t.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.createTable('error_logs', (t) => {
    t.bigIncrements('id').primary();
    t.string('level', 10).notNullable().defaultTo('error');
    t.string('source', 30).notNullable().defaultTo('app');
    t.text('message');
    t.text('stack');
    t.string('path', 255).nullable();
    t.bigInteger('user_id').unsigned().nullable();
    t.json('meta');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['created_at']);
    t.index(['level']);
  });

  await knex.schema.createTable('event_logs', (t) => {
    t.bigIncrements('id').primary();
    t.string('source', 30).notNullable();
    t.string('type', 60).notNullable();
    t.string('message', 500).nullable();
    t.json('meta');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['created_at']);
    t.index(['source']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('request_logs');
  await knex.schema.dropTableIfExists('error_logs');
  await knex.schema.dropTableIfExists('event_logs');
};