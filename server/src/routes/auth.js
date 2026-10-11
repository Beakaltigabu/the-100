const express = require('express');
const bcrypt = require('bcryptjs');
const z = require('zod');
const db = require('../db');
const config = require('../config');
const { requireAuth, signToken, signSessionToken, verifyToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { createNotification } = require('../services/notifications');
const googleAuth = require('../services/googleAuth');
const { authLimiter, loginLimiter, registerLimiter, oauthLimiter, forgotLimiter, resetLimiter } = require('../middleware/rateLimit');
const { recordFailure, remainingBlock, clear } = require('../lib/loginGuard');
const { sanitizeName } = require('../lib/sanitize');
const { normalizeEmail } = require('../lib/emails');
const passwordReset = require('../services/passwordReset');
const telegramMessenger = require('../services/telegramMessenger');
const botMessages = require('../services/botMessages');
const mailer = require('../services/mailer');
const { logEvent } = require('../services/logger');

const router = express.Router();

// Precomputed bcrypt hash of a random throwaway password — used to equalize
// login timing for unknown/passwordless accounts (prevents user enumeration).
const DUMMY_PASSWORD_HASH = '$2b$12$eiuZFOuuH1TzWS5bjCXCxejYdMVgCAkNTBvG2qnc/qlgHmJ1bFAE.';

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

// Look up a member by their email, matching the exact address OR its normalized
// form (Gmail dots/plus folded) — so jane.smith@gmail.com and janesmith@gmail.com
// resolve to the same account instead of letting someone create a duplicate.
function findByEmail(email) {
  const normalized = normalizeEmail(email);
  const q = db('users').where({ email });
  if (normalized && normalized !== email) q.orWhere({ email_normalized: normalized });
  return q.first();
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
    const normalized = normalizeEmail(email);

    const existing = await findByEmail(email);
    if (existing) {
      throw new AppError('An account with this email already exists', 409, { code: 'email_exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [id] = await db('users').insert({
      name: cleanName,
      email,
      email_normalized: normalized || null,
      password_hash: passwordHash
    });

    const token = signSessionToken({ id, token_version: 0 });
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

    const user = await findByEmail(email);
    // Always run a bcrypt.compare (against a dummy hash when the account is
    // missing or passwordless) so response timing doesn't reveal which
    // emails are registered, and always return the same generic message.
    const ok = await bcrypt.compare(
      password,
      user && user.password_hash ? user.password_hash : DUMMY_PASSWORD_HASH
    );
    if (!user || !user.password_hash || !ok) {
      recordFailure(req.ip, email);
      throw new AppError('Invalid email or password', 401);
    }

    clear(req.ip, email);
    const token = signSessionToken(user);
    setAuthCookie(res, token);
    res.json({ message: 'Logged in' });
  })
);

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
});

// ── Password reset (email + Telegram) ────────────────
// A reset link is delivered by every channel the member has (email when SMTP is
// configured, Telegram DM when linked) so a forgotten password never leads a
// member to create a duplicate account.
router.post(
  '/forgot-password',
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(255) }).safeParse(req.body);
    if (!parsed.success) {
      return res.json({ message: 'If an account exists with that email, a reset link was sent.' });
    }
    const { email } = parsed.data;
    const user = await findByEmail(email);
    if (user) {
      passwordReset.pruneExpired().catch(() => {});
      // Always hand out a fresh token; deliver via EVERY channel available to
      // the member (email first, Telegram too) so a forgotten password never
      // blocks someone into creating a duplicate account.
      const token = await passwordReset.createResetToken(user.id);
      const url = `${config.clientOrigin}/reset-password?token=${token}`;
      const lang = await telegramMessenger.getUserLanguage(user.id);

      let delivered = false;
      const mailRes = await mailer.send({
        to: user.email,
        subject: lang === 'am' ? 'የTHE 100 የይለፍ ቃል መቀየሪያ አገናኝ' : 'Your THE 100 password reset link',
        text:
          (lang === 'am' ? `እንደገና መግባት እንዲችሉ ይህንን አገናኝ ይክፈቱ፡ ${url}` : `Open this link to reset your password: ${url}`) +
          '\n\n' +
          (lang === 'am' ? 'አገናኙ ለ15 ደቂቃ ብቻ የሚሰራ ነው።' : 'The link is valid for 15 minutes.')
      });
      if (mailRes.sent) delivered = true;

      const conn = await db('telegram_connections').where({ user_id: user.id, state: 'active' }).first();
      if (conn && conn.telegram_user_id) {
        telegramMessenger.sendToUser(user.id, botMessages.resetLink(lang, url));
        delivered = true;
      }

      if (!delivered) {
        logEvent({
          source: 'auth',
          type: 'reset_no_channel',
          message: `Password reset for user ${user.id} had no delivery channel (no SMTP, no Telegram)`,
          meta: { userId: String(user.id) }
        }).catch(() => {});
      }
    }
    // Generic reply regardless of existence — never reveal which emails exist.
    res.json({ message: 'If an account exists with that email, a reset link was sent.' });
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
    const passwordHash = await bcrypt.hash(password, 12);
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
    // mode tells the callback whether this is a login or a registration.
    // A login for an email with no account must NOT auto-create — it routes
    // to /register with an inline message instead.
    const mode = req.query.mode === 'register' ? 'register' : 'login';
    const state = signToken(
      { purpose: 'google_auth', mode, returnTo: sanitizeReturn(req.query.returnTo) },
      { expiresIn: '10m' }
    );
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
    // Never link/create accounts from an unverified Google email claim.
    if (info.email_verified !== true) {
      throw new AppError('Google email address is not verified', 400);
    }

    let user = await findByEmail(email);
    if (!user) {
      // Login mode must not create an account (also prevents re-login after
      // account deletion). Send them to register with an inline message.
      if (payload.mode !== 'register') {
        clearAuthCookie(res);
        return res.redirect(`${config.clientOrigin}/register?google_no_account=1`);
      }
      const [id] = await db('users').insert({
        name: info.name || email.split('@')[0],
        email,
        email_normalized: normalizeEmail(email) || null,
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

    const token = signSessionToken(user);
    setAuthCookie(res, token);
    res.redirect(`${config.clientOrigin}${payload.returnTo || '/dashboard'}`);
  })
);

const meHandler = [
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;
    // Whether the member has committed to the active challenge (no enrollment
    // => they must go through onboarding before using the dashboard/community).
    const enrollment = await db('enrollments')
      .join('challenges', 'challenges.id', 'enrollments.challenge_id')
      .where({ 'enrollments.user_id': user.id, 'challenges.is_active': true })
      .select('enrollments.id')
      .first();
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
      pwaInstalled: !!user.pwa_installed,
      hasEnrollment: !!enrollment,
      language: user.language || 'en',
      isAdmin: req.isAdmin
    });
  })
];

router.get('/me', meHandler);

module.exports = router;
module.exports.meHandler = meHandler;