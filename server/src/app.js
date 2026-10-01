const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const db = require('./db');
const { dbHealthy } = require('./services/dbHealth');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/errors');
const { apiLimiter, webhookLimiter, telegramWebhookLimiter, adminLimiter, contactLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const onboardingRoutes = require('./routes/onboarding');
const challengeRoutes = require('./routes/challenges');
const notificationRoutes = require('./routes/notifications');
const pushRoutes = require('./routes/push');
const progressRoutes = require('./routes/progress');
const activityRoutes = require('./routes/activities');
const milestoneRoutes = require('./routes/milestones');
const profileRoutes = require('./routes/profile');
const communityRoutes = require('./routes/community');
const stravaIntegrationRoutes = require('./routes/integrations/strava');
const telegramIntegrationRoutes = require('./routes/integrations/telegram');
const stravaWebhookRoutes = require('./routes/webhooks/strava');
const telegramWebhookRoutes = require('./routes/webhooks/telegram');
const adminRoutes = require('./routes/admin');
const contactRoutes = require('./routes/contact');
const broadcastPublicRoutes = require('./routes/broadcasts');
const sessionRoutes = require('./routes/session');
const { logRequest } = require('./services/logger');

const app = express();

// CORS allowlist: the configured client origin PLUS its www/apex twin, so the
// app works from both chooseyour100.com and www.chooseyour100.com. Extra
// origins can be added via CORS_ORIGINS (comma-separated).
function corsOrigins() {
  const list = [];
  const base = config.clientOrigin;
  if (base && base.startsWith('http')) {
    if (!list.includes(base)) list.push(base);
    try {
      const url = new URL(base);
      if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
        // local dev — no www twin
      } else if (url.hostname.startsWith('www.')) {
        const apex = base.replace(url.hostname, url.hostname.slice(4));
        if (!list.includes(apex)) list.push(apex);
      } else {
        const www = base.replace(url.hostname, `www.${url.hostname}`);
        if (!list.includes(www)) list.push(www);
      }
    } catch {
      // not a parseable URL — use the base as-is
    }
  }
  if (process.env.CORS_ORIGINS) {
    for (const o of process.env.CORS_ORIGINS.split(',')) {
      const t = o.trim();
      if (t && !list.includes(t)) list.push(t);
    }
  }
  return list;
}

// Paths that are never worth logging (assets, pings, icons).
const LOG_SKIP = [
  /^\/assets\//,
  /^\/icons\//,
  /^\/favicon/,
  /^\/icon\.svg/,
  /^\/manifest/,
  /^\/sw\.js/,
  /^\/api\/health/,
  /\.(png|jpe?g|svg|webp|ico|woff2?|css|js)$/
];

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins(),
    credentials: true
  })
);

// Shed load while the shared MySQL server is saturated ("Too many connections"):
// fail API requests fast with 503 instead of attempting DB work that would fail
// anyway and pile more load onto a full server. (Health + the reach probe are
// exempt — they don't touch the app's DB.)
app.use((req, res, next) => {
  if (!dbHealthy() && req.path !== '/api/health' && !req.path.startsWith('/api/health/')) {
    return res.status(503).json({ error: 'Service temporarily unavailable', retryAfter: 30 });
  }
  return next();
});
// The `verify` hook stashes the raw body so signature-based webhooks (Strava)
// can hash the exact bytes Strava sent — the global JSON parser otherwise
// consumes the body before a route can read it raw.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(cookieParser());
app.use(compression());

app.use((req, res, next) => {
  if (config.env === 'test') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const url = req.originalUrl || req.url;
    const pathname = url.split('?')[0];
    if (LOG_SKIP.some((re) => re.test(pathname))) return;
    // Log the pathname only — the query string can carry OAuth codes/tokens.
    console.log(`${req.method} ${pathname} ${res.statusCode} ${ms}ms`);
    logRequest({
      method: req.method,
      path: pathname,
      status: res.statusCode,
      duration_ms: ms,
      ip: String(req.headers['x-forwarded-for'] || req.ip || '').slice(0, 64),
      user_agent: req.headers['user-agent'] || '',
      user_id: req.user ? req.user.id : null,
      source: 'web'
    });
  });
  next();
});

app.use(apiLimiter);

// User-specific API responses must never be cached (by LiteSpeed, browsers, or
// any intermediary). Without this header, a caching layer can serve a stale
// /api/me (e.g. an old hasEnrollment=false) for days. Routes that intentionally
// cache public data (challenges/next, community feed) override this afterwards.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Server's public egress IP (for whitelisting in the cloud DB's allowlist).
// Guarded by the same ADMIN_PROBE_SECRET as the reach probe.
app.get('/api/health/egress-ip', async (req, res) => {
  const secret = process.env.ADMIN_PROBE_SECRET;
  if (!secret || req.get('X-Admin-Probe') !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) });
    const ip = (await r.text()).trim();
    res.json({ egressIp: ip });
  } catch (err) {
    res.status(502).json({ error: 'could not determine egress IP', detail: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'the-100', time: new Date().toISOString() });
});

// Server-side DB connection test: uses the app's real knex pool against whatever
// DB_* the server env points at. Triggered from a local script; guarded by the
// same ADMIN_PROBE_SECRET. Exempt from the 503 shed-load middleware (it's a
// diagnostic that must be able to attempt the DB and report the real error).
app.post('/api/health/db-test', async (req, res) => {
  const secret = process.env.ADMIN_PROBE_SECRET;
  if (!secret || req.get('X-Admin-Probe') !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.raw('SELECT VERSION() AS v');
    const version = rows && rows[0] ? rows[0].v : 'unknown';
    const users = await db('users').count({ c: '*' }).first();
    const ch = await db('challenges').where({ is_active: true }).first();
    res.json({
      ok: true,
      serverVersion: version,
      database: process.env.DB_NAME || '?',
      user: process.env.DB_USER || '?',
      users: Number(users && users.c) || 0,
      challenge: ch ? { start: ch.start_date, end: ch.end_date } : null
    });
  } catch (err) {
    const code = String(err.code || err.name || 'UNKNOWN');
    const detail = /Timeout acquiring a connection/i.test(String(err.message || ''))
      ? 'pool acquire timeout — DB unreachable/busy'
      : String(err.message || err);
    res.json({ ok: false, code, detail });
  }
});

// Reachability probe (migration diagnostic): tests TCP+TLS reachability of a
// target MySQL host FROM this server (e.g. cPanel -> Aiven) WITHOUT needing the
// app's DB or admin login. Guarded by ADMIN_PROBE_SECRET (env) via the
// X-Admin-Probe header; disabled when the secret is not set.
app.post('/api/health/db-reach', (req, res) => {
  const secret = process.env.ADMIN_PROBE_SECRET;
  if (!secret || req.get('X-Admin-Probe') !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const host = String((req.body && req.body.host) || '').trim();
  const port = Number((req.body && req.body.port) || 3306);
  if (!host) return res.status(400).json({ error: 'host is required' });
  mysql
    .createConnection({ host, port, user: 'probe', password: 'probe', connectTimeout: 6000, ssl: { rejectUnauthorized: false } })
    .then((conn) =>
      conn
        .query('SELECT 1')
        .then(() => {
          conn.end().catch(() => {});
          res.json({ reachable: true, host, port, detail: 'connected' });
        })
        .catch((err) => {
          conn.end().catch(() => {});
          res.json({ reachable: false, host, port, code: String(err.code || ''), detail: 'query failed' });
        })
    )
    .catch((err) => {
      const code = String(err.code || '');
      const networkish = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN/.test(code);
      const handshake = code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_HOST_NOT_PRIVILEGED' || code === 'ER_HOST_IS_BLOCKED';
      res.json({
        reachable: handshake,
        host,
        port,
        code,
        detail: handshake ? 'reachable (server responded — auth rejected for probe creds, expected)' : networkish ? 'unreachable (network / firewall)' : 'unknown'
      });
    });
});

app.use('/api/auth', authRoutes);
app.get('/api/me', authRoutes.meHandler);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/integrations/strava', stravaIntegrationRoutes);
app.use('/api/integrations/telegram', telegramIntegrationRoutes);
app.use('/api/webhooks/strava', webhookLimiter, stravaWebhookRoutes);
app.use('/api/webhooks/telegram', telegramWebhookLimiter, telegramWebhookRoutes);
app.use('/api/contact', contactLimiter, contactRoutes);
app.use('/api/broadcasts', broadcastPublicRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);

// In production, serve the built SPA from the same Node app (cPanel-friendly).
// The API lives under /api/*; everything else falls back to index.html. The
// SPA is normally hosted on public_html, so serving from here is optional — set
// CLIENT_DIST_DIR to opt in (and to get a warning if the folder is missing).
if (config.env === 'production') {
  const dist = process.env.CLIENT_DIST_DIR || path.join(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    // Vite emits content-hashed files under /assets — safe to cache forever.
    // Everything else (sw.js, manifest, icons) revalidates quickly.
    app.use(
      express.static(dist, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
          }
        }
      })
    );
    app.get(/^\/(?!api\/).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else if (process.env.CLIENT_DIST_DIR) {
    console.warn(`[warn] client/dist not found at ${dist} — build the client (npm run build).`);
  }
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;