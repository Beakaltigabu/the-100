exports.up = async function up(knex) {
  await knex.schema.createTable('password_reset_tokens', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable();
    t.string('token_hash', 64).notNullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('used_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['token_hash']);
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });

  await knex.schema.createTable('admin_audit_log', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('admin_user_id').unsigned().notNullable();
    t.string('action', 120).notNullable();
    t.string('target_type', 60).nullable();
    t.string('target_id', 60).nullable();
    t.string('ip', 64).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['admin_user_id', 'created_at']);
    t.foreign('admin_user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('admin_audit_log');
  await knex.schema.dropTableIfExists('password_reset_tokens');
};