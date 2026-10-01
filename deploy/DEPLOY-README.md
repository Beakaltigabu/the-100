# THE 100 — Deploy Kit (DB-safe)

Everything needed to deploy the current code to cPanel **without touching existing prod data**.
The prod DB already has data (33 users, 33 enrollments, 26 Telegram links, 7 Strava links).

## Artifacts in this folder
| Artifact | Purpose |
|---|---|
| `the100-api.zip` | Backend app root (`the100-api/`) — **no** node_modules, tests, `.env`, `db/schema.sql`. |
| `../client/dist/` | Frontend build (prod API URL baked in; PWA + push SW). Upload to `public_html`. |
| `../db/backups/chooseyo_the100_prod.sql` | **Your rollback backup.** Keep it safe. |

## 1. Backup (rollback point) — ALREADY DONE
`db/backups/chooseyo_the100_prod.sql` is the prod dump. If you want a fresh one:
cPanel → Backups → Download a MySQL Database Backup → `chooseyo_the100_prod`.

## 2. Capture pre-migration row counts on prod
phpMyAdmin → `chooseyo_the100_prod` → run for each: `SELECT COUNT(*) FROM users;`
`enrollments`, `challenge_activities`, `milestones`, `telegram_connections`,
`strava_connections`, `community_posts`, `notifications`. Save the numbers.

## 3. Upload the backend
1. cPanel → File Manager → app root (e.g. `~/the100-api/`) → upload `the100-api.zip` → Extract.
2. cPanel → **Setup Node.js App** → (create or reuse) Application URL `api.chooseyour100.com`,
   startup file `src/index.js`.
3. **Environment Variables** — set exactly `server/.env.production` values
   (`NODE_ENV=production`, `DB_HOST=localhost`, `DB_USER=chooseyo_the100_app`,
   `DB_PASSWORD`, `DB_NAME=chooseyo_the100_prod`, `JWT_SECRET`, `ENCRYPTION_KEY`,
   `CLIENT_ORIGIN=https://chooseyour100.com`, `BASE_URL=https://api.chooseyour100.com`,
   `COOKIE_SECURE=true`, Strava/Telegram/Google values, `AUTO_MIGRATE=false` **for now**).
4. Click the selector's **Run/Install** (installs deps from package.json), then **Start**.

## 4. Bring prod's schema current — incremental, verified zero-data-loss
Prod is at migration 20; the code is at 36. The 16 migrations are **additive** (verified:
`npm run db:migrate -- the100_prodcopy` on a real-prod copy → all existing tables kept
identical row counts; suite passed 140/140 against that copy).

1. In the cPanel Node env, set **`AUTO_MIGRATE=true`** → restart the app.
2. Watch the app **Logs**: expect `[migrate] done` (16 migrations) → `THE 100 API listening …`.
3. Set **`AUTO_MIGRATE=false`** → restart.
4. **NEVER** import `db/schema.sql` over the live DB — that path is only for a fresh/empty rebuild.

## 5. Verify (no data loss)
- [ ] Row counts match step 2 for every existing table.
- [ ] New tables exist: `bot_state`, `bot_settings`, `badges`, `user_badges`, `events`,
      `event_participants`, `community_challenges`, `broadcasts`, `broadcast_recipients`,
      `push_subscriptions`, `notification_preferences`, `community_comments`,
      `community_bookmarks`, `community_follows`.
- [ ] `GET https://api.chooseyour100.com/api/health` → `{"ok":true,...}`.

## 6. Upload the frontend
cPanel File Manager → `public_html` → upload the **contents** of `client/dist/` (not the
folder). Upload the SPA-fallback `.htaccess` (see `THE-100-DEPLOYMENT-GUIDE.md` §5.2).

## 7. Point webhooks at prod (run locally AFTER the API is live)
```bash
cd server
# Telegram — use the prod bot token via the production env
npm run telegram:setwebhook -- set https://api.chooseyour100.com/api/webhooks/telegram
npm run telegram:webhook:info            # confirm callback_query in allowed_updates
npm run telegram:setup
npm run strava:subscribe -- create https://api.chooseyour100.com/api/webhooks/strava
```

## 8. Rollback
- Restore the DB from `db/backups/chooseyo_the100_prod.sql` (cPanel Restore, or phpMyAdmin
  Import). Re-upload previous app sources if code rolled back too.
- The two bot migrations are reversible (`down()`), but a full DB restore is the safe rollback.

## Data-loss rules
1. Backup before any migration. 2. Never re-import `schema.sql` over live data.
3. Compare row counts before/after. 4. Keep the dump + migration set in sync with the code.