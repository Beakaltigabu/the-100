const db = require('../db');

// Lightweight per-user bot flow state. A missing row is treated as no state.
// Stored as a JSON string so knex/MySQL never inline an object into SQL.
async function getState(userId) {
  const row = await db('bot_state').where({ user_id: userId }).first();
  if (!row || row.state == null) return null;
  try {
    return typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
  } catch {
    return row.state;
  }
}

async function setState(userId, state) {
  const value = state == null ? null : JSON.stringify(state);
  await db('bot_state')
    .insert({ user_id: userId, state: value, updated_at: db.fn.now() })
    .onConflict('user_id')
    .merge({ state: value, updated_at: db.fn.now() });
}

async function clearState(userId) {
  await db('bot_state').where({ user_id: userId }).del();
}

module.exports = { getState, setState, clearState };