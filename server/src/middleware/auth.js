const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { AppError } = require('./errors');

const JWT_ISSUER = 'the100-api';
const JWT_AUDIENCE = 'the100-client';

function signToken(payload, options = {}) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: options.expiresIn || config.jwt.expiresIn,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });
}

// Session tokens carry the user's token_version (`tv`) so password resets and
// credential changes invalidate every outstanding session.
function signSessionToken(user) {
  return signToken({ sub: user.id, tv: user.token_version ?? 0 });
}

// Short-lived impersonation token: an admin can view the app "as" a member.
function signImpersonationToken(adminId, memberId) {
  return signToken({ sub: memberId, imp: adminId, purpose: 'impersonation' }, { expiresIn: '30m' });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });
}

function setAuthCookie(res, token) {
  res.cookie(config.cookie.name, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'lax',
    path: '/'
  });
}

async function requireAuth(req, res, next) {
  try {
    // Impersonation takes precedence over the session cookie: an admin viewing
    // "as" a member sends an X-Impersonate token and acts as that member.
    const impToken = req.headers && req.headers['x-impersonate'];
    if (impToken) {
      const p = verifyToken(impToken);
      if (p.purpose === 'impersonation' && p.sub) {
        const member = await db('users').where({ id: p.sub }).first();
        if (member && !member.banned_at) {
          const admin = await db('admins').where({ user_id: member.id }).first();
          req.user = member;
          req.isAdmin = !!admin;
          req.isImpersonating = true;
          req.impersonatorId = p.imp;
          return next();
        }
      }
      return next(new AppError('Invalid or expired impersonation session', 401));
    }

    const token = req.cookies && req.cookies[config.cookie.name];
    if (!token) {
      return next(new AppError('Authentication required', 401));
    }
    const payload = verifyToken(token);
    const user = await db('users').where({ id: payload.sub }).first();
    if (!user) {
      return next(new AppError('User no longer exists', 401));
    }
    // Session tokens must match the user's current token_version; a password
    // reset/change bumps it and kills every previously issued session.
    if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
      return next(new AppError('Session is no longer valid', 401));
    }
    // Global ban: a banned account cannot use the app.
    if (user.banned_at) {
      return next(new AppError('Account suspended', 401));
    }
    const admin = await db('admins').where({ user_id: user.id }).first();
    req.user = user;
    req.isAdmin = !!admin;
    next();
  } catch (err) {
    next(new AppError('Invalid or expired token', 401));
  }
}

async function requireAdmin(req, res, next) {
  try {
    if (!req.isAdmin) {
      return next(new AppError('Admin access required', 403));
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { signToken, signSessionToken, signImpersonationToken, verifyToken, setAuthCookie, clearAuthCookie, requireAuth, requireAdmin };