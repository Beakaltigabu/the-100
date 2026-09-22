exports.up = async function up(knex) {
  await knex.schema.createTable('meta', (t) => {
    t.string('meta_key', 100).primary();
    t.text('meta_value');
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('meta');
};