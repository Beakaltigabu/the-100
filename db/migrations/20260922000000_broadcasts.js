// Admin broadcast — system-wide messaging (MVP: send-now, all users).
// 1. Widen notifications.type so announcements/broadcasts can be stored.
// 2. `broadcasts` records each admin message for history.

exports.up = async function up(knex) {
  await knex.raw(
    "ALTER TABLE `notifications` MODIFY COLUMN `type` ENUM('welcome','commitment','milestone','weekly_checkin','inactivity','finish','announcement','reminder','broadcast','event','product_update','warning') NOT NULL"
  );

  await knex.schema.createTable('broadcasts', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('admin_user_id').unsigned().nullable();
    t.string('type', 30).notNullable().defaultTo('announcement');
    t.string('title', 160).notNullable();
    t.text('body').notNullable();
    t.string('title_am', 160).nullable();
    t.text('body_am').nullable();
    // Comma-separated channel list: inapp,telegram,group
    t.string('channels', 100).notNullable().defaultTo('inapp,telegram');
    t.string('target', 30).notNullable().defaultTo('all');
    t.integer('recipient_count').notNullable().defaultTo(0);
    t.integer('telegram_count').notNullable().defaultTo(0);
    t.boolean('group_sent').notNullable().defaultTo(false);
    t.timestamp('sent_at').nullable();
    t.timestamps(true, true);
    t.index(['created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('broadcasts');
  await knex.raw(
    "ALTER TABLE `notifications` MODIFY COLUMN `type` ENUM('welcome','commitment','milestone','weekly_checkin','inactivity','finish') NOT NULL"
  );
};
