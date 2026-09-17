exports.up = async function up(knex) {
  const challenge = await knex('challenges').where({ is_active: true }).orderBy('id', 'desc').first();
  if (challenge) {
    await knex('enrollments').update({
      start_date: challenge.start_date,
      end_date: challenge.end_date
    });
  }
};

exports.down = async function down() {
  // No meaningful revert.
};
