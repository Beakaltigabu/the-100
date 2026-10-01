const db = require('../db');
const config = require('../config');
const webpush = require('web-push');

// VAPID is required for push to work at all; everything else degrades silently.
if (config.vapid.publicKey && config.vapid.privateKey && config.vapid.subject) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
}

function configured() {
  return !!(config.vapid.publicKey && config.vapid.privateKey && config.vapid.subject);
}

// Send a push notification to every subscription a user has registered. Dead
// subscriptions (410 Gone / 404) are pruned. Fire-and-forget friendly: never
// throws — callers catch and log via the returned promise.
async function sendPush(userId, { title, body, url = '/' } = {}) {
  if (!configured()) return { sent: 0, pruned: 0 };
  const subs = await db('push_subscriptions').where({ user_id: userId });
  if (!subs.length) return { sent: 0, pruned: 0 };

  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  let pruned = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        payload,
        { TTL: 60 * 60 * 24 } // 24h: drop expired pushes instead of queueing them
      );
      sent += 1;
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await db('push_subscriptions').where({ id: sub.id }).del();
        pruned += 1;
      }
    }
  }
  return { sent, pruned };
}

module.exports = { sendPush, configured };