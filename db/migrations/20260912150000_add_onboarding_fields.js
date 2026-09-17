exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('motivation', 50).nullable();
    t.enu('preferred_time', ['morning', 'evening', 'flexible']).nullable();
    t.string('schedule_days', 20).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('motivation');
    t.dropColumn('preferred_time');
    t.dropColumn('schedule_days');
  });
};