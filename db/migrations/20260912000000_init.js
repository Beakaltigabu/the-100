const ACTIVITY_TYPES = ['running', 'walking', 'run_walk', 'cycling', 'other'];
const EXPERIENCE_LEVELS = ['beginner', 'occasional', 'consistent', 'experienced'];
const ENROLLMENT_STATUS = ['committed', 'active', 'completed', 'abandoned'];
const ACTIVITY_SOURCE = ['manual', 'strava'];
const TELEGRAM_STATES = [
  'not_connected',
  'invite_generated',
  'join_requested',
  'approved',
  'active',
  'left',
  'removed'
];
const NOTIFICATION_TYPES = [
  'welcome',
  'commitment',
  'milestone',
  'weekly_checkin',
  'inactivity',
  'finish'
];
const NOTIFICATION_CHANNELS = ['web', 'email', 'telegram'];

exports.up = async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.bigIncrements('id').primary();
    t.string('name', 120).notNullable();
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('photo_url', 255).nullable();
    t.string('location', 120).nullable();
    t.integer('age').nullable();
    t.string('social_handle', 120).nullable();
    t.enu('experience_level', EXPERIENCE_LEVELS).nullable();
    t.decimal('weekly_baseline_km', 6, 2).nullable();
    t.enu('activity_type', ACTIVITY_TYPES).nullable();
    t.boolean('onboarding_complete').notNullable().defaultTo(false);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('admins', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable().unique();
    t.enu('role', ['owner', 'admin']).notNullable().defaultTo('admin');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });

  await knex.schema.createTable('challenges', (t) => {
    t.bigIncrements('id').primary();
    t.string('name', 120).notNullable();
    t.text('description').nullable();
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('enrollments', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable();
    t.bigInteger('challenge_id').unsigned().notNullable();
    t.enu('activity_type', ACTIVITY_TYPES).notNullable();
    t.decimal('goal_distance', 8, 2).notNullable();
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.enu('status', ENROLLMENT_STATUS).notNullable().defaultTo('committed');
    t.timestamp('completed_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['user_id', 'challenge_id']);
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.foreign('challenge_id').references('id').inTable('challenges').onDelete('CASCADE');
  });

  await knex.schema.createTable('challenge_activities', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('enrollment_id').unsigned().notNullable();
    t.date('date').notNullable();
    t.decimal('distance', 8, 2).notNullable();
    t.enu('activity_type', ACTIVITY_TYPES).notNullable();
    t.enu('source', ACTIVITY_SOURCE).notNullable().defaultTo('manual');
    t.bigInteger('strava_activity_id').unsigned().nullable().unique();
    t.string('notes', 255).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['enrollment_id', 'date']);
    t.foreign('enrollment_id').references('id').inTable('enrollments').onDelete('CASCADE');
  });

  await knex.schema.createTable('milestones', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('enrollment_id').unsigned().notNullable();
    t.decimal('threshold', 8, 2).notNullable();
    t.timestamp('reached_at').nullable();
    t.timestamp('notified_at').nullable();
    t.unique(['enrollment_id', 'threshold']);
    t.foreign('enrollment_id').references('id').inTable('enrollments').onDelete('CASCADE');
  });

  await knex.schema.createTable('telegram_connections', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable().unique();
    t.bigInteger('telegram_user_id').unsigned().nullable();
    t.enu('state', TELEGRAM_STATES).notNullable().defaultTo('not_connected');
    t.string('link_token_hash', 64).nullable();
    t.timestamp('link_expires_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });

  await knex.schema.createTable('strava_connections', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable().unique();
    t.bigInteger('strava_athlete_id').unsigned().nullable();
    t.text('encrypted_access_token').nullable();
    t.text('encrypted_refresh_token').nullable();
    t.timestamp('token_expires_at').nullable();
    t.string('scope', 255).nullable();
    t.enu('status', ['connected', 'disconnected']).notNullable().defaultTo('connected');
    t.timestamp('connected_at').nullable();
    t.timestamp('disconnected_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });

  await knex.schema.createTable('notifications', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable();
    t.enu('type', NOTIFICATION_TYPES).notNullable();
    t.string('title', 120).notNullable();
    t.text('body').notNullable();
    t.enu('channel', NOTIFICATION_CHANNELS).notNullable().defaultTo('web');
    t.timestamp('read_at').nullable();
    t.timestamp('sent_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('strava_connections');
  await knex.schema.dropTableIfExists('telegram_connections');
  await knex.schema.dropTableIfExists('milestones');
  await knex.schema.dropTableIfExists('challenge_activities');
  await knex.schema.dropTableIfExists('enrollments');
  await knex.schema.dropTableIfExists('challenges');
  await knex.schema.dropTableIfExists('admins');
  await knex.schema.dropTableIfExists('users');
};