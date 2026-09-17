const path = require('path');
const fs = require('fs');
const app = require('./app');
const config = require('./config');
const knex = require('./db');
const { startScheduler } = require('./services/scheduler');

// Resolves the migrations folder in both layouts: repo (../../db/migrations) and
// the deployed app-root (../db/migrations, where db/ sits next to src/).
function migrationsDir() {
  const candidates = [
    path.join(__dirname, '../../db/migrations'),
    path.join(__dirname, '../db/migrations')
  ];
  return candidates.find((dir) => fs.existsSync(dir)) || candidates[1];
}

async function boot() {
  // Deployment helper: apply knex migrations at boot when AUTO_MIGRATE=true.
  // Needed for cPanel File Manager-only deploys (no shell access). Set to false
  // after the first successful boot.
  if (process.env.AUTO_MIGRATE === 'true') {
    const dir = migrationsDir();
    console.log(`[migrate] applying knex migrations from ${dir}`);
    await knex.migrate.latest({ directory: dir });
    console.log('[migrate] done');
  }

  app.listen(config.port, () => {
    console.log(`THE 100 API listening on http://localhost:${config.port}`);
    startScheduler();
  });
}

boot().catch((err) => {
  console.error('Boot failed:', err);
  process.exit(1);
});