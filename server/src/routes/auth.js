const express = require('express');
const bcrypt = require('bcryptjs');
const z = require('zod');
const db = require('../db');
const config = require('../config');
const { requireAuth, signToken, verifyToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { createNotification } = require('../services/notifications');
const googleAuth = require('../services/googleAuth');
const { authLimiter, loginLimiter, registerLimiter, oauthLimiter, forgotLimiter, resetLimiter } = require('../middleware/rateLimit');
const { recordFailure, remainingBlock, clear } = require('../lib/loginGuard');
const { sanitizeName } = require('../lib/sanitize');
const passwordReset = require('../services/passwordReset');
const telegramMessenger = require('../services/telegramMessenger');
const botMessages = require('../services/botMessages');

const router = express.Router();

const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
  password: passwordSchema
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1)
});

function sanitizeReturn(v) {
  if (!v || typeof v !== 'string') return '/dashboard';
  if (!v.startsWith('/') || v.startsWith('//')) return '/dashboard';
  return v;
}

router.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Invalid registration data', 400, parsed.error.flatten());
    }
    const { name, email, password } = parsed.data;
    const cleanName = sanitizeName(name);

    const existing = await db('users').where({ email }).first();
    if (existing) {
      throw new AppError('An account with this email already exists', 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [id] = await db('users').insert({
      name: cleanName,
      email,
      password_hash: passwordHash
    });

    const token = signToken({ sub: id });
    setAuthCookie(res, token);
    await createNotification({
      userId: id,
      type: 'welcome',
      title: 'Welcome to THE 100.',
      body: 'Your 100-day journey starts here. Choose your goal.'
    });
    res.status(201).json({ message: 'Welcome to THE 100.' });
  })
);

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Invalid login data', 400);
    }
    const { email, password } = parsed.data;

    const blocked = remainingBlock(req.ip, email);
    if (blocked > 0) {
      throw new AppError('Too many failed attempts. Try again later.', 429);
    }

    const user = await db('users').where({ email }).first();
    if (!user || !user.password_hash) {
      recordFailure(req.ip, email);
      throw new AppError(
        user && !user.password_hash ? 'This account uses Google sign-in.' : 'Invalid email or password',
        401
      );
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      recordFailure(req.ip, email);
      throw new AppError('Invalid email or password', 401);
    }

    clear(req.ip, email);
    const token = signToken({ sub: user.id });
    setAuthCookie(res, token);
    res.json({ message: 'Logged in' });
  })
);

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
});

// ── Password reset (delivered via Telegram DM) ──────
router.post(
  '/forgot-password',
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(255) }).safeParse(req.body);
    if (!parsed.success) {
      return res.json({ message: 'If that account exists and is linked to Telegram, a reset link was sent.' });
    }
    const { email } = parsed.data;
    const user = await db('users').where({ email }).first();
    if (user) {
      passwordReset.pruneExpired().catch(() => {});
      const conn = await db('telegram_connections').where({ user_id: user.id, state: 'active' }).first();
      if (conn && conn.telegram_user_id) {
        const token = await passwordReset.createResetToken(user.id);
        const url = `${config.clientOrigin}/reset-password?token=${token}`;
        const lang = await telegramMessenger.getUserLanguage(user.id);
        telegramMessenger.sendToUser(user.id, botMessages.resetLink(lang, url));
      }
    }
    res.json({ message: 'If that account exists and is linked to Telegram, a reset link was sent.' });
  })
);

router.post(
  '/reset-password',
  resetLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ token: z.string().min(32).max(128), password: passwordSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Invalid reset request', 400, parsed.error.flatten());
    }
    const { token, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = await passwordReset.resetPasswordWithToken(token, passwordHash);
    if (!userId) {
      throw new AppError('This reset link is invalid or expired.', 400);
    }
    clearAuthCookie(res);
    res.json({ message: 'Password updated. You can now sign in.' });
  })
);

// ── Google OAuth ─────────────────────────────────────
router.get(
  '/google',
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!googleAuth.configured()) {
      throw new AppError('Google sign-in is not configured', 503);
    }
    const state = signToken({ purpose: 'google_auth', returnTo: sanitizeReturn(req.query.returnTo) });
    res.redirect(googleAuth.authorizeUrl(state));
  })
);

router.get(
  '/google/callback',
  oauthLimiter,
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      throw new AppError('Google sign-in was cancelled', 400);
    }
    if (!code || !state) {
      throw new AppError('Missing code or state', 400);
    }
    let payload;
    try {
      payload = verifyToken(state);
    } catch {
      throw new AppError('Invalid OAuth state', 400);
    }
    if (payload.purpose !== 'google_auth') {
      throw new AppError('Invalid OAuth state', 400);
    }

    const tokens = await googleAuth.exchangeCode(code);
    const info = await googleAuth.getUserInfo(tokens.access_token);
    const email = (info.email || '').toLowerCase();
    if (!email) {
      throw new AppError('Google did not return an email', 400);
    }

    let user = await db('users').where({ email }).first();
    if (!user) {
      const [id] = await db('users').insert({
        name: info.name || email.split('@')[0],
        email,
        password_hash: null,
        google_id: info.sub,
        email_verified: true,
        photo_url: info.picture || null,
        onboarding_complete: false
      });
      user = await db('users').where({ id }).first();
    } else {
      const updates = { email_verified: true, updated_at: db.fn.now() };
      if (!user.google_id) updates.google_id = info.sub;
      await db('users').where({ id: user.id }).update(updates);
    }

    const token = signToken({ sub: user.id });
    setAuthCookie(res, token);
    res.redirect(`${config.clientOrigin}${payload.returnTo || '/dashboard'}`);
  })
);

const meHandler = [
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      photoUrl: user.photo_url,
      location: user.location,
      age: user.age,
      socialHandle: user.social_handle,
      experienceLevel: user.experience_level,
      weeklyBaseline: Number(user.weekly_baseline) || null,
      activityType: user.activity_type,
      otherActivity: user.other_activity || null,
      motivation: user.motivation ? user.motivation.split(',').filter(Boolean) : [],
      preferredTime: user.preferred_time || null,
      scheduleDays: user.schedule_days ? user.schedule_days.split(',').map(Number) : [],
      onboardingComplete: !!user.onboarding_complete,
      emailVerified: !!user.email_verified,
      hasGoogle: !!user.google_id,
      language: user.language || 'en',
      isAdmin: req.isAdmin
    });
  })
];

router.get('/me', meHandler);

module.exports = router;
module.exports.meHandler = meHandler;