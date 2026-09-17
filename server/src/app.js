const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/errors');
const { apiLimiter, webhookLimiter, oauthLimiter, connectLimiter, adminLimiter } = require('./middleware/rateLimit');

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

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(compression({ threshold: 0 }));

app.use((req, res, next) => {
  if (config.env === 'test') return next();
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.use(apiLimiter);

app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
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
app.use('/api/integrations/strava', connectLimiter, stravaIntegrationRoutes);
app.use('/api/integrations/telegram', connectLimiter, telegramIntegrationRoutes);
app.use('/api/webhooks/strava', webhookLimiter, stravaWebhookRoutes);
app.use('/api/webhooks/telegram', webhookLimiter, telegramWebhookRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);

// In production, serve the built SPA from the same Node app (cPanel-friendly).
// The API lives under /api/*; everything else falls back to index.html.
if (config.env === 'production') {
  const dist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    console.warn(`[warn] client/dist not found at ${dist} — build the client (npm run build).`);
  }
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;