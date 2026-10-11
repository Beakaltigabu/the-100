const config = require('../config');

// Optional SMTP email delivery (nodemailer). Entirely disabled when SMTP_HOST
// is unset, so the app still works without email infra — reset links then fall
// back to Telegram/support paths. Never throws on send failure: callers decide
// how to surface the result.
const nodemailer = require('nodemailer');

let transporter = null;

function configured() {
  return !!(config.smtp.host && config.smtp.user);
}

function getTransporter() {
  if (!configured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }
  return transporter;
}

// Sends a plain-text email. Resolves { sent: boolean, reason? } — never throws.
async function send({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) return { sent: false, reason: 'not-configured' };
  try {
    await t.sendMail({
      from: config.smtp.from || undefined,
      to,
      subject,
      text: text || undefined,
      html: html || undefined
    });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { configured, send };