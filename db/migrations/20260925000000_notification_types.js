// Add the missing broadcast message types to notifications.type so publishing a
// 'nudge' or 'custom' broadcast no longer hits "Data truncated for column type".

exports.up = async function up(knex) {
  await knex.raw(
    "ALTER TABLE `notifications` MODIFY COLUMN `type` ENUM('welcome','commitment','milestone','weekly_checkin','inactivity','finish','announcement','reminder','broadcast','event','product_update','warning','nudge','custom') NOT NULL"
  );
};

exports.down = async function down(knex) {
  await knex.raw(
    "ALTER TABLE `notifications` MODIFY COLUMN `type` ENUM('welcome','commitment','milestone','weekly_checkin','inactivity','finish','announcement','reminder','broadcast','event','product_update','warning') NOT NULL"
  );
};
