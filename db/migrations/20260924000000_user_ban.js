// Global ban: a banned user is blocked from the web app and from Telegram bot
// messaging. `banned_at` is set when banned, cleared when unbanned.

exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.timestamp('banned_at').nullable();
    t.index(['banned_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('banned_at');
  });
};
