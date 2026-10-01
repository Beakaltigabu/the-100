// Community events (virtual meetups) with RSVP participation.
exports.up = async function up(knex) {
  await knex.schema.createTable('events', (t) => {
    t.bigIncrements('id').primary();
    t.string('title', 160).notNullable();
    t.string('description', 500).nullable();
    t.datetime('starts_at').notNullable();
    t.string('link', 300).nullable();
    t.string('status', 20).notNullable().defaultTo('upcoming');
    t.bigInteger('created_by').unsigned().nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.createTable('event_participants', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('event_id').unsigned().notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.timestamp('rsvp_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['event_id', 'user_id']);
    t.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('event_participants');
  await knex.schema.dropTableIfExists('events');
};