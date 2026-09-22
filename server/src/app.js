const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/errors');
const { apiLimiter, webhookLimiter, telegramWebhookLimiter, adminLimiter, contactLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const onboardingRoutes = require('./routes/onboarding');
const challengeRoutes = require('./routes/challenges');
const notificationRoutes = require('./routes/notifications');
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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'the-100', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.get('/api/me', authRoutes.meHandler);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/notifications', notificationRoutes);
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
app.use('/api/admin', adminLimiter, adminRoutes);

// In production, serve the built SPA from the same Node app (cPanel-friendly).
// The API lives under /api/*; everything else falls back to index.html.
if (config.env === 'production') {
  const dist = path.join(__dirname, '../../client/dist');
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
  } else {
    console.warn(`[warn] client/dist not found at ${dist} — build the client (npm run build).`);
  }
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;