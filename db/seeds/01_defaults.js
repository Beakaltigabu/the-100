const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@the100.app';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';

// THE 100 launches September 21, 2026 and runs for 100 days.
const CHALLENGE_START = '2026-09-21';
const CHALLENGE_END = '2026-12-29';

function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

exports.seed = async function seed(knex) {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await knex('challenges').del();
  await knex('challenges').insert({
    name: 'THE 100',
    description: '100 days. Your goal. Your commitment.',
    start_date: CHALLENGE_START,
    end_date: CHALLENGE_END,
    is_active: true
  });

  const existing = await knex('users').where({ email: ADMIN_EMAIL }).first();
  let userId;
  if (existing) {
    userId = existing.id;
    await knex('users').where({ id: userId }).update({ onboarding_complete: true });
  } else {
    const ids = await knex('users').insert({
      name: 'THE 100 Admin',
      email: ADMIN_EMAIL,
      password_hash: passwordHash,
      onboarding_complete: true
    });
    userId = ids[0];
  }

  const adminExists = await knex('admins').where({ user_id: userId }).first();
  if (!adminExists) {
    await knex('admins').insert({ user_id: userId, role: 'owner' });
  }

  console.log(`Seed complete. Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
};