exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('motivation', 120).nullable().alter();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('motivation', 50).nullable().alter();
  });
};