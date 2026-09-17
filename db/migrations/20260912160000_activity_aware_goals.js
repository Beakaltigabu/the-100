const ACTIVITY_TYPES = ['running', 'walking', 'run_walk', 'cycling', 'swimming', 'resistance', 'other'];

exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.enu('activity_type', ACTIVITY_TYPES).nullable().alter();
    t.renameColumn('weekly_baseline_km', 'weekly_baseline');
    t.string('other_activity', 60).nullable();
  });

  await knex.schema.alterTable('enrollments', (t) => {
    t.enu('activity_type', ACTIVITY_TYPES).notNullable().alter();
    t.renameColumn('goal_distance', 'goal_value');
  });

  await knex.schema.alterTable('challenge_activities', (t) => {
    t.enu('activity_type', ACTIVITY_TYPES).notNullable().alter();
    t.renameColumn('distance', 'quantity');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.renameColumn('weekly_baseline', 'weekly_baseline_km');
    t.dropColumn('other_activity');
    t.enu('activity_type', ['running', 'walking', 'run_walk', 'cycling', 'other']).nullable().alter();
  });

  await knex.schema.alterTable('enrollments', (t) => {
    t.renameColumn('goal_value', 'goal_distance');
    t.enu('activity_type', ['running', 'walking', 'run_walk', 'cycling', 'other']).notNullable().alter();
  });

  await knex.schema.alterTable('challenge_activities', (t) => {
    t.renameColumn('quantity', 'distance');
    t.enu('activity_type', ['running', 'walking', 'run_walk', 'cycling', 'other']).notNullable().alter();
  });
};