// Duplicate-account prevention: store a normalized email (lowercased + trimmed,
// Gmail dots/plus folded) per user and enforce uniqueness in the app's
// register/login/Google flows. Backfills existing rows. The index is NOT unique
// in the DB — pre-existing duplicate addresses (jane.smith@gmail.com and
// janesmith@gmail.com as two real accounts) must be surfaced/merged by the
// admin tool, not crash this migration.
function normalizeEmail(email) {
  const raw = String(email == null ? '' : email).trim().toLowerCase();
  const at = raw.indexOf('@');
  if (at <= 0) return raw;
  const local = raw.slice(0, at);
  let domain = raw.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    domain = 'gmail.com';
    return `${local.replace(/\./g, '').split('+')[0]}@${domain}`;
  }
  return raw;
}

exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('email_normalized', 255).nullable();
    t.index('email_normalized', 'users_email_normalized_idx');
  });

  const rows = await knex('users').select('id', 'email');
  for (const row of rows) {
    if (!row.email) continue;
    const n = normalizeEmail(row.email);
    if (n) {
      await knex('users').where({ id: row.id }).update({ email_normalized: n });
    }
  }
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropIndex('email_normalized', 'users_email_normalized_idx');
    t.dropColumn('email_normalized');
  });
};