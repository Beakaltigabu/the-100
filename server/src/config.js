const path = require('path');
const fs = require('fs');

// Load .env from explicit paths instead of relying on the process working
// directory (which can differ on cPanel/CloudLinux NodeJS Selector). Covers the
// deployed app root and the local repo layout.
const envCandidates = [
  path.join(__dirname, '../.env'), // deployed: <app-root>/.env
  path.join(__dirname, '../../.env'), // repo dev: server/../.env
  path.join(process.cwd(), '.env')
];
const envPath = envCandidates.find((p) => fs.existsSync(p));
require('dotenv').config(envPath ? { path: envPath } : {});

const { validateConfig } = require('./config/validate');

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  serverBase: process.env.BASE_URL || 'http://localhost:4000',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'the100'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'insecure-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    name: 'the100_token'
  },

  encryptionKey: process.env.ENCRYPTION_KEY || '',

  strava: {
    clientId: process.env.STRAVA_CLIENT_ID || '',
    clientSecret: process.env.STRAVA_CLIENT_SECRET || '',
    verifyToken: process.env.STRAVA_VERIFY_TOKEN || '',
    redirectUri: process.env.STRAVA_REDIRECT_URI || ''
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    groupId: process.env.TELEGRAM_GROUP_ID || '',
    groupLink: process.env.TELEGRAM_GROUP_LINK || ''
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || ''
  }
};

if (config.env === 'production') {
  const problems = validateConfig(process.env);
  if (problems.length) {
    throw new Error(`Invalid production configuration: ${problems.join('; ')}`);
  }
} else if (config.jwt.secret === 'insecure-dev-secret') {
  console.warn('[warn] JWT_SECRET is not set — using the INSECURE dev default. Never run this in production.');
}

module.exports = config;