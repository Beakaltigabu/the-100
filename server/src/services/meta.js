const db = require('../db');

async function getMeta(key) {
  const row = await db('meta').where({ meta_key: key }).first();
  return row ? row.meta_value : null;
}

async function setMeta(key, value) {
  await db('meta')
    .insert({ meta_key: key, meta_value: String(value) })
    .onConflict('meta_key')
    .merge({ meta_value: String(value), updated_at: db.fn.now() });
}

module.exports = { getMeta, setMeta };