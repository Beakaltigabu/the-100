const db = require('../db');
const { generateToken, hashToken } = require('../lib/tokens');

const RESET_TTL_MS = 15 * 60 * 1000;

async function createResetToken(userId) {
  const token = generateToken(32);
  await db('password_reset_tokens').insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + RESET_TTL_MS)
  });
  return token;
}

// Validates the token (exists, unexpired, unused) and returns the user id.
async function consumeResetToken(token) {
  const row = await db('password_reset_tokens').where({ token_hash: hashToken(token) }).first();
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  await db('password_reset_tokens').where({ id: row.id }).update({ used_at: db.fn.now() });
  return row.user_id;
}

// Applies a new password in the same transaction that burns the token, so a
// failed update never consumes a valid reset link.
async function resetPasswordWithToken(token, passwordHash) {
  const userId = await db.transaction(async (trx) => {
    const row = await trx('password_reset_tokens').where({ token_hash: hashToken(token) }).first();
    if (!row) return null;
    if (row.used_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    await trx('users').where({ id: row.user_id }).update({ password_hash: passwordHash, updated_at: trx.fn.now() });
    await trx('password_reset_tokens').where({ id: row.id }).update({ used_at: trx.fn.now() });
    return row.user_id;
  });
  return userId;
}

async function pruneExpired() {
  await db('password_reset_tokens').where('expires_at', '<', db.fn.now()).del();
}

module.exports = { createResetToken, consumeResetToken, resetPasswordWithToken, pruneExpired, RESET_TTL_MS };