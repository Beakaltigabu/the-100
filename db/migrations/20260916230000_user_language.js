exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('language', 10).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('language');
  });
};