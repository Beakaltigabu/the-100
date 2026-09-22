// Returns a list of config problems for the given environment object.
// The app must not boot in production until this returns an empty list.
function validateConfig(env = process.env) {
  const errors = [];

  if (!env.JWT_SECRET || env.JWT_SECRET === 'insecure-dev-secret') {
    errors.push('JWT_SECRET must be set to a strong secret (the dev default is not allowed)');
  } else if (env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  if (!env.ENCRYPTION_KEY) {
    errors.push('ENCRYPTION_KEY must be set (used to encrypt Strava tokens)');
  } else if (env.ENCRYPTION_KEY.length < 32) {
    // Matches the runtime requirement in lib/crypto.js — fail at boot, not per-request.
    errors.push('ENCRYPTION_KEY must be at least 32 characters');
  }

  if (!env.DB_PASSWORD) {
    errors.push('DB_PASSWORD must be set (empty database passwords are not allowed in production)');
  }

  if (!env.CLIENT_ORIGIN || !/^https:\/\//.test(env.CLIENT_ORIGIN)) {
    errors.push('CLIENT_ORIGIN must be an https URL');
  }

  if (!env.BASE_URL || !/^https:\/\//.test(env.BASE_URL)) {
    errors.push('BASE_URL must be an https URL');
  }

  if (env.COOKIE_SECURE !== 'true') {
    errors.push('COOKIE_SECURE must be "true" so auth cookies are sent over HTTPS only');
  }

  if (!env.TELEGRAM_BOT_TOKEN) {
    errors.push('TELEGRAM_BOT_TOKEN must be set (the Telegram bot is a core feature)');
  }

  return errors;
}

module.exports = { validateConfig };