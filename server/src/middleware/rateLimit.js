const rateLimit = require('express-rate-limit');

const MESSAGE = { error: 'Too many requests. Please try again later.' };

// Dev/load-test escape hatch. NEVER honored in production — used so the
// loadtest script can measure true throughput instead of 429 responses.
const disabled = process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production';
const makeLimiter = (opts) => (disabled ? (req, res, next) => next() : rateLimit({ ...opts, message: MESSAGE, standardHeaders: true, legacyHeaders: false }));

const authLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 30 });

const loginLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

const registerLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

const forgotLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

const resetLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

const deleteLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 3 });

const postLimiter = makeLimiter({ windowMs: 60 * 1000, max: 5 });

const cheerLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 60 });

const reportLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

// Global API guardrail (webhooks excluded — they get their own limiter).
const apiLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 600,
  skip: (req) => req.originalUrl.startsWith('/api/webhooks/')
});

const oauthLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

const connectLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

const adminLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 200 });

const webhookLimiter = makeLimiter({ windowMs: 60 * 1000, max: 120 });
const telegramWebhookLimiter = makeLimiter({ windowMs: 60 * 1000, max: 120 });
const contactLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

module.exports = {
  authLimiter,
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  resetLimiter,
  deleteLimiter,
  postLimiter,
  cheerLimiter,
  reportLimiter,
  apiLimiter,
  oauthLimiter,
  connectLimiter,
  adminLimiter,
  webhookLimiter,
  telegramWebhookLimiter,
  contactLimiter
};