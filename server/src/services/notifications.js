const db = require('../db');

async function createNotification({ userId, type, title, body, channel = 'web' }) {
  const [id] = await db('notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    channel,
    sent_at: db.fn.now()
  });
  return id;
}

async function listForUser(userId) {
  return db('notifications').where({ user_id: userId }).orderBy('created_at', 'desc');
}

async function markAllRead(userId) {
  await db('notifications').where({ user_id: userId }).whereNull('read_at').update({ read_at: db.fn.now() });
}

module.exports = { createNotification, listForUser, markAllRead };