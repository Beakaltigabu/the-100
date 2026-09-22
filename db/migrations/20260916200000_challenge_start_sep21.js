const CHALLENGE_START = '2026-09-23';
const CHALLENGE_END = '2026-12-31';

exports.up = async function up(knex) {
  await knex('challenges')
    .where({ is_active: true })
    .update({ start_date: CHALLENGE_START, end_date: CHALLENGE_END });
};

exports.down = async function down() {
  // Dates are announcement-driven; no meaningful revert.
};
