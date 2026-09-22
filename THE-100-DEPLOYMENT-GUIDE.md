# THE 100 — Deployment & Integration Guide

Deploy THE 100 (React SPA + Node/Express API + MySQL) to **cPanel** for:

- **Frontend (SPA):** `https://chooseyour100.com` — static build served from `public_html`
- **Backend (API):** `https://api.chooseyour100.com` — cPanel **Node.js app** (Express)
- Integrations: **Google OAuth**, **Strava** (OAuth + webhooks), **Telegram bot**
  (DMs + community group + password reset), and **ngrok** for local/testing tunnels.

This deployment uses **cPanel File Manager only** (no shell/terminal on the server),
so the backend is prepared to run from an uploaded, platform-neutral
`node_modules` and to apply DB migrations without a shell.

> Related docs: `THE-100-SECURITY.md` (production security checklist) and
> `THE-100-PERFORMANCE.md` (load-testing + index checklist).

---

## 1. Architecture (this deployment)

```
Browser (PWA)  →  https://chooseyour100.com      (static SPA in public_html)
                          │  fetch + cookies (same-site, cross-origin)
                          ▼
cPanel Node.js app  →  https://api.chooseyour100.com   (Express, server/src/index.js)
   │  /api/*                      API + auth + webhooks
   ▼
MySQL  chooseyo_the100_prod       (Knex migrations)
   ▼
External: Google OAuth, Strava (OAuth + webhook), Telegram Bot API
```

- The SPA is **static** — no Node process on `chooseyour100.com`.
- The API is a **Node app on a subdomain**. Because `chooseyour100.com` and
  `api.chooseyour100.com` share the same registrable domain, they are **same-site**:
  `SameSite=Lax` auth cookies set by the API are sent back on API calls from the SPA.
- CORS is locked to `CLIENT_ORIGIN=https://chooseyour100.com`.
- The SPA's CSP `connect-src` includes `https://api.chooseyour100.com`.

---

## 2. Before you start

**Local build & test (on your machine)**

```bash
cd server && npm install && npm test          # expect 44 passing
cd ../client && npm install && npm run build
```

**What gets deployed**
- `client/dist/` → uploaded to `public_html` (SPA).
- `server/` → the Node app (source + env) uploaded via File Manager
  (`node_modules` installed by the CloudLinux NodeJS Selector, §4.4).
- `db/migrations/` → copied into the app root (kept for future migrations, §4.6).
- `db/schema.sql` → imported once via phpMyAdmin (no migration step after upload).
- **On the live DB** (phpMyAdmin, in order): `db/observability.sql` (request/error/event
  logs) then `db/contact-messages.sql` (support inbox). For fresh DBs these are already
  inside `db/schema.sql`.
- Public pages: **Support** `https://chooseyour100.com/support`, **Privacy**
  `https://chooseyour100.com/privacy` (Strava review URLs).

**Backend code changes required for this deployment** (documented in §4). Do these
locally before building/uploading:
1. `server`: use **`bcryptjs`** (pure JS) instead of native `bcrypt` — a Windows-built
   native `.node` binary will not run on Linux cPanel, and File Manager can't
   `npm install` on the server. `bcryptjs` has no native deps, so an uploaded
   `node_modules` runs anywhere. Hashes are cross-compatible (`$2a$`/`$2b$`), so
   existing user hashes keep working.
2. `client`: make the API base configurable (`VITE_API_URL` → `api/client.js` prepends
   it) and point the Google OAuth link (`OAuthButtons.jsx`) at the API origin.
3. `client`: CSP `connect-src` must include `https://api.chooseyour100.com`
   (`vite.config.js` → `cspPlugin`).
4. `server`: add `AUTO_MIGRATE=true` support so `knex.migrate.latest` runs against the
   uploaded `db/migrations` at boot (no shell needed).

**Generate fresh production secrets** (provided in §3 / generated during implementation):

```bash
openssl rand -hex 48   # JWT_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -hex 24   # STRAVA_VERIFY_TOKEN
```

---

## 3. Hosting plan & secrets (this deployment)

| Item | Value |
|---|---|
| SPA domain | `chooseyour100.com` (SSL: AutoSSL / Let's Encrypt) |
| API subdomain | `api.chooseyour100.com` (SSL required) |
| cPanel Node.js | "Setup Node.js App" → Application URL `api.chooseyour100.com` |
| Node version | 20+ LTS |
| MySQL DB | `chooseyo_the100_prod` |
| MySQL user | `chooseyo_the100_app` |
| MySQL pass | `<db-password>` — **watch the special chars** (`;` and `[`) |
| DB host/port | `localhost` / `3306` |
| Migration method | phpMyAdmin schema import (§4.6) — `AUTO_MIGRATE=false` |

**Secrets (generated during implementation — never commit):**
- `JWT_SECRET`, `ENCRYPTION_KEY`, `STRAVA_VERIFY_TOKEN` (values will be printed once).

> ⚠️ The DB password contains `;`, `#`, and `[`. In the **cPanel env UI** paste it
> as-is. In a **`.env` file it must be double-quoted** because `#` starts a comment
> in dotenv (use `DB_PASSWORD="<db-password>"`). In any **shell** command
> single-quote it: `DB_PASSWORD='<db-password>'`.

---

## 4. Backend implementation (cPanel, File Manager-only)

This section is the full backend runbook.

### 4.1 Make the code portable (no native modules)

Ensure `server/package.json` depends on **`bcryptjs`** (not `bcrypt`), and the server
imports `bcryptjs`:

```js
// server/src/routes/auth.js and server/src/routes/profile.js
const bcrypt = require('bcryptjs');
```

Then install locally (your machine) and verify the tree has **no** `.node` binaries:

```bash
cd server
npm install                      # installs pure-JS deps only
npm test                         # 44 tests
```

### 4.2 Add AUTO_MIGRATE (run migrations without a shell)

In `server/src/index.js`, before `app.listen`, add:

```js
const path = require('path');
const knex = require('./db');

async function boot() {
  if (process.env.AUTO_MIGRATE === 'true') {
    console.log('[migrate] applying knex migrations…');
    await knex.migrate.latest({ directory: path.join(__dirname, '../db/migrations') });
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
```

The uploaded `db/` folder must sit **inside the app root** (so the path
`<app-root>/src/../db/migrations` resolves). See the layout in §4.4.

### 4.3 Environment variables (backend)

Set these in **cPanel → Setup Node.js App → Environment Variables** (preferred) or in
`server/.env` (upload via File Manager with "Show hidden files" enabled):

> `server/.env` is already populated with the production values (dev values are
> commented out above them). Upload it directly, or copy its values into the
> cPanel env UI. Local dev lives in `server/.env.dev.bak`.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | (cPanel-assigned) |
| `CLIENT_ORIGIN` | `https://chooseyour100.com` |
| `BASE_URL` | `https://api.chooseyour100.com` |
| `COOKIE_SECURE` | `true` |
| `JWT_SECRET` | `<generated>` |
| `JWT_EXPIRES_IN` | `7d` |
| `ENCRYPTION_KEY` | `<generated>` |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_USER` | `chooseyo_the100_app` |
| `DB_PASSWORD` | `<db-password>` |
| `DB_NAME` | `chooseyo_the100_prod` |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | (reuse existing app) |
| `STRAVA_VERIFY_TOKEN` | `<generated>` |
| `STRAVA_REDIRECT_URI` | `https://api.chooseyour100.com/api/integrations/strava/callback` |
| `TELEGRAM_BOT_TOKEN` | (reuse existing bot) |
| `TELEGRAM_BOT_USERNAME` | `the100days_bot` |
| `TELEGRAM_GROUP_ID` | `-1004396043198` |
| `TELEGRAM_GROUP_LINK` | `https://t.me/+pOsJz7n6qEQzMWY8` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | (reuse existing app) |
| `GOOGLE_REDIRECT_URI` | `https://api.chooseyour100.com/api/auth/google/callback` |
| `APP_TIMEZONE` | `Africa/Addis_Ababa` (optional; default matches) |
| `AUTO_MIGRATE` | `false` (schema is imported via phpMyAdmin, §4.6) |

> The server **refuses to boot** in production unless `JWT_SECRET`, `ENCRYPTION_KEY`,
> HTTPS `CLIENT_ORIGIN`/`BASE_URL`, `COOKIE_SECURE=true`, **and `TELEGRAM_BOT_TOKEN`**
> are set (`server/src/config/validate.js`).

### 4.4 Upload layout (File Manager + CloudLinux NodeJS Selector)

Create the app root (e.g. `~/the100-api/`), then upload/zip-extract:

```
the100-api/                     ← cPanel Node.js Application root
├── src/                        (server source)
├── scripts/                    (webhook/setup scripts)
├── db/
│   └── migrations/             (knex migrations — kept for future AUTO_MIGRATE)
├── package.json
└── package-lock.json
```

⚠️ **Do NOT include `node_modules`** in the zip. The CloudLinux **NodeJS Selector**
installs packages itself from `package.json` (via the Setup Node.js App UI) — an
uploaded `node_modules` breaks the app. After creating the app in §4.5, click the
selector's "Run" / reload to install dependencies, then Start.

Steps:
1. Locally: `cd server && npm install` (pure JS after §4.1).
2. Zip the app-root contents (**excluding** `.env` if you use the env UI, and
   **excluding** `tests/`, `scripts/telegram-dev.mjs`, `.env.dev.bak`).
3. cPanel **File Manager** → navigate to the app root → upload the zip → **Extract**.
   - cPanel **Terminal not required** — everything is File Manager + the Node app UI.

### 4.5 cPanel Node.js app

1. **cPanel → Setup Node.js App → Create Application**
   - Node.js version: latest LTS
   - Application root: `the100-api`
   - Application URL: `api.chooseyour100.com`
   - Application startup file: `src/index.js`
   - Application entry point: `src/index.js`
   - **Create**, then **Environment Variables** → add §4.3.
2. **Start** the app. Watch the log (cPanel shows "Logs") for:
   - `THE 100 API listening on http://localhost:<port>`
   - `[telegram] webhook is set to …` warnings only if the webhook URL is wrong.
3. `AUTO_MIGRATE` stays `false` — the schema is imported once via phpMyAdmin (§4.6),
   so **no migration step is needed after upload**.

### 4.6 Schema — the recommended flow (no migrations after upload)

Import the **already-current schema** so production matches local exactly. The repo's
`db/schema.sql` is regenerated from a fully-migrated database and contains every table
**plus** the `knex_migrations` state rows, so nothing else needs to run.

1. cPanel **phpMyAdmin** → select `chooseyo_the100_prod` → **Import** → `db/schema.sql`.
2. Keep `AUTO_MIGRATE=false`. Because the `knex_migrations` table ships populated,
   even a stray `AUTO_MIGRATE=true` would skip everything.
3. Verify: 19 tables appear (`meta`, `community_announcements`,
   `community_reports`, `community_cheers`, …).

> **Future migrations**: when a new migration lands in `db/migrations/`, either
> (a) upload it and flip `AUTO_MIGRATE=true` once (restart), then back to `false`; or
> (b) import an incremental SQL. Keep the dump / migration set in sync with the code.

**Alternative — AUTO_MIGRATE on boot** (only if you skip the import): knex runs
`migrate:latest` at boot against the uploaded `db/migrations`. The DB user has ALL
PRIVILEGES, so DDL works. Set `false` after the first successful boot.

### 4.7 Admin access (grant-only)

After the schema is imported and the app is running:

1. Register / log in at `https://chooseyour100.com` with
   **`beakaltigabu29@gmail.com`** (name: **beakal**).
2. In phpMyAdmin (`chooseyo_the100_prod`), run **`db/grant-admin.sql`**
   (`INSERT IGNORE INTO admins …` — safe to re-run).
3. The app derives admin rights from the `admins` table, so `/admin` works immediately.

### 4.8 Helper scripts — run LOCALLY (no server shell)

The webhook/command scripts just hit public APIs, so run them **on your machine**
with production env values in `server/.env`:

```bash
cd server

# Telegram webhook → production (must be HTTPS)
npm run telegram:setwebhook -- set https://api.chooseyour100.com/api/webhooks/telegram
npm run telegram:webhook:info                 # url + allowed_updates (incl. chat_join_request)
npm run telegram:setup                        # bilingual command menu + bot profile

# Strava webhook subscription
npm run strava:subscribe -- create https://api.chooseyour100.com/api/webhooks/strava
npm run strava:subscribe -- list
```

Re-run the Telegram/Strava `set`/`create` if a URL changes.

### 4.8 Scheduler

`server/src/services/scheduler.js` starts with the app (+10s) and every 6h (finishers,
inactivity, weekly check-ins, daily digest). cPanel keeps the Node app running, so it
works automatically. Run **one** instance only (in-memory rate limits/lockout).

---

## 5. Frontend build & upload

### 5.1 Build with the API origin

```bash
cd client
VITE_API_URL=https://api.chooseyour100.com npm run build
```

> ⚠️ A production build **requires** `VITE_API_URL` — the build now **fails loudly**
> if it's missing (a build without it silently compiles `API_BASE=''`, sending all
> `/api/*` calls to the static SPA origin → 404).

- `client/src/api/client.js` prepends `VITE_API_URL` to all `/api/*` calls
  (empty in dev → the Vite proxy `:5173 → :4000` still works).
- `client/src/components/OAuthButtons.jsx` links Google login to the API origin.
- `vite.config.js` `cspPlugin` sets `connect-src 'self' https://api.chooseyour100.com`.
- Output: `client/dist/` (index.html + assets + `sw.js` + `manifest.webmanifest`).

### 5.2 Upload to public_html

1. cPanel **File Manager** → `public_html` → upload the **contents** of `client/dist/`
   (not the `dist` folder itself).
2. Upload an `.htaccess` into `public_html` for SPA fallback:

```apache
RewriteEngine On
RewriteBase /
# SPA fallback (don't touch real files; there is no /api here)
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . index.html [L]
```

3. Ensure SSL is active on `chooseyour100.com` and `api.chooseyour100.com` before
   testing (cookies are `Secure`).

---

## 6. Serving / cross-origin notes

- The API is served by Express under `/api/*` on `api.chooseyour100.com`. The SPA
  never serves `/api` (it's static).
- Cookies are `SameSite=Lax` and scoped to `api.chooseyour100.com`; because both
  subdomains are same-site, the SPA's `fetch(..., { credentials: 'include' })` sends
  them. Do **not** split onto different top-level domains, or auth breaks.
- CORS on the API allows exactly `CLIENT_ORIGIN` with credentials.
- Mixed content: everything must be HTTPS (SPA + API + external OAuth).

---

## 7. Integrations

### 7.1 Google OAuth
1. [Google Cloud Console](https://console.cloud.google.com) → project → OAuth consent
   screen (External) → add/keep your users, and **Publish** the app so real users can
   sign in (or keep it in Testing and add them as test users).
2. Credentials → OAuth client ID (Web application) → **Authorized redirect URIs** add:
   `https://api.chooseyour100.com/api/auth/google/callback`
   (keep the dev `http://localhost:4000/api/auth/google/callback` if you still develop).
3. Set `GOOGLE_REDIRECT_URI` to that exact URI (no trailing slash).
4. Restart the backend.
5. Scope is `openid email profile` (already set in `server/src/services/googleAuth.js`).

**Test:** on the SPA → `/login` → Continue with Google → returns to dashboard
(round-trip lands back on `https://chooseyour100.com`).

### 7.2 Strava
1. developers.strava.com → your app → set **Authorization callback domain** to
   `api.chooseyour100.com`.
2. `STRAVA_REDIRECT_URI=https://api.chooseyour100.com/api/integrations/strava/callback`.
3. **OAuth scope is `activity:read_all`** (`server/src/services/strava.js`) so all of a
   member's activities (incl. private) import and webhook events cover them. If the
   app was authorized with an older scope, have the member **disconnect + reconnect**.
4. Subscribe to webhooks (run locally, §4.7) →
   `https://api.chooseyour100.com/api/webhooks/strava`.
   ⚠️ **Public DNS must be live first** — Strava's servers reach the callback URL via
   public DNS, so a local hosts-file override does not help here. Wait for propagation.

**Test:** `/profile` → CONNECT STRAVA → authorize (`read_all`) → returns connected;
a run syncs (post-launch).

### 7.3 Telegram
1. Reuse the bot (`TELEGRAM_BOT_TOKEN`, `the100days_bot`).
2. Re-point the webhook (run locally, §4.7) →
   `https://api.chooseyour100.com/api/webhooks/telegram`.
3. Re-run `npm run telegram:setup` for the bilingual menu/profile.
4. Group: `TELEGRAM_GROUP_ID=-1004396043198`, `TELEGRAM_GROUP_LINK` set; **"Approve
   new members"** enabled in the group so the bot auto-approves linked members.

**Test:** deep link from the app links the account; `/status`, `/day`, `/goal`,
`/checkin 5`, `/streaks`, `/language am`, `/help` reply in EN/AM; group join → welcome;
forgot-password → reset link DM.

### 7.4 ngrok (local/testing only)
```bash
ngrok http 4000
```
Then (dev `.env`): `BASE_URL=https://<ngrok-url>`, `CLIENT_ORIGIN=http://localhost:5173`,
and re-point webhooks to `https://<ngrok-url>/api/...`. Free URLs change on restart —
re-run the `set`/`create` scripts. Never use ngrok in production.

---

## 8. Post-deployment test checklist (cross-origin aware)

Run against production.

### 8.1 Basics
- [ ] `GET https://api.chooseyour100.com/api/health` → `{"ok":true,"service":"the-100",...}`.
- [ ] `GET https://chooseyour100.com/` → SPA loads (PWA installable, theme toggle).
- [ ] `/login`, `/register`, `/forgot-password`, `/reset-password` render.
- [ ] API responses carry `Content-Security-Policy`, `Strict-Transport-Security`,
      `X-Frame-Options`, `RateLimit-Policy`; SPA page works with CSP allowing the API.
- [ ] No mixed-content warnings in DevTools (all requests HTTPS).

### 8.2 Auth & cross-origin cookies
- [ ] Register on the SPA → `Set-Cookie` from `api.chooseyour100.com`; subsequent
      requests include it (same-site).
- [ ] Login OK; 5 wrong passwords → 6th attempt 429.
- [ ] Logout clears the cookie; protected route → `/login`.
- [ ] Cookies `HttpOnly`, `Secure`, `SameSite=Lax`.
- [ ] Duplicate register email → 409.

### 8.3 Onboarding → dashboard → logging → community → admin
- [ ] Onboarding → dashboard countdown + goal. Manual log accepted inside the window,
      rejected pre-launch.
- [ ] Milestones/notifications update; `/community` feed + post + cheer + delete.
- [ ] `/admin` stats, members (progress/day/status), member detail, `/admin/audit`.

### 8.4 Integrations
- [ ] Google login round-trip lands back on `https://chooseyour100.com`.
- [ ] Strava connect round-trip returns to `/profile?strava=connected`; run syncs
      post-launch; disconnect works.
- [ ] Telegram link + commands + group join/welcome + milestone post + reset DM.

### 8.5 Reliability
- [ ] Refresh `/` repeatedly — no console/fetch errors.
- [ ] Restart the Node app (cPanel) → boots, scheduler runs, health OK.
- [ ] DB backup/restore verified (§9).
- [ ] `npm audit` clean in `server/` and `client/`.

---

## 9. Backups & maintenance

- **DB**: cPanel → Backups → dump `chooseyo_the100_prod` regularly. Restore via
  phpMyAdmin (Import) or `mysql -u chooseyo_the100_app -p'<db-password>' chooseyo_the100_prod < backup.sql`.
- **Deploys**: rebuild client with `VITE_API_URL`, re-upload changed files, restart the
  Node app. For new migrations, run `AUTO_MIGRATE=true` once (restart) then back to `false`.
- **Rotate** `JWT_SECRET`/`ENCRYPTION_KEY`/`DB_PASSWORD` if ever exposed; update the
  OAuth/webhook URIs consistently.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Backend won't start in prod | Missing/invalid `JWT_SECRET`, `ENCRYPTION_KEY`, HTTPS `CLIENT_ORIGIN`/`BASE_URL`, `COOKIE_SECURE=true`. |
| `Cannot find module bcrypt` | Native `bcrypt` still installed — switch to `bcryptjs` (§4.1), reinstall, re-upload. |
| Migrations didn't run | `AUTO_MIGRATE` not `true`, `db/migrations` missing at `<app-root>/db/migrations`, or DB user lacks DDL. |
| `api.…` returns **502 Bad Gateway** | The Node process is stopped or crashed at boot. Check the app **status + Logs**: ensure `src/config.js` (env-path dotenv fix) and `db/migrations` are uploaded, the DB/user/grant exist, then restart. Expect `[migrate] done` → `THE 100 API listening on http://localhost:<port>`. |
| SPA can't reach API (CORS) | `CLIENT_ORIGIN` wrong; or the SPA build used a stale `VITE_API_URL`. |
| `/api/*` calls 404 on the SPA origin | The deployed `client/dist` was built **without** `VITE_API_URL` → rebuild with `VITE_API_URL=https://api.chooseyour100.com npm run build` and re-upload. |
| `blob:` script CSP violations in console | Browser-extension noise — the strict `script-src 'self'` is working as intended; the app is fine. Do **not** add `blob:` to `script-src`. |
| Login "doesn't stick" over `http://` | Cookies are `Secure` — must test over **HTTPS** (requires DNS propagation + AutoSSL). |
| Login cookie not sent | Hosts on different top-level domains; must be same registrable domain (`…com` + `api.…com`). |
| CSP blocks API calls | `connect-src` in `vite.config.js` missing the API origin → rebuild + re-upload SPA. |
| Google login fails at redirect | `GOOGLE_REDIRECT_URI` must match the console URI exactly (no trailing slash). |
| Strava webhook not receiving | Subscription URL wrong/not HTTPS; re-run `strava:subscribe -- create` (locally). |
| Telegram bot silent | Stale webhook URL (ngrok changed); re-run `telegram:setwebhook` + `telegram:webhook:info`. |
| Bot "not linked" | Connection is `invite_generated` — complete `/start <token>`. |
| Login bounces to dashboard | Stale SPA build — redeploy `client/dist` + hard refresh. |
| Rate limits hit in testing | Expected; restart the app or use `DISABLE_RATE_LIMIT=true` **in dev only**. |

---

## 11. Rollback

- Keep the previous `client/dist` + app-root sources (dated folder or git tag).
- Restore the last DB backup, restore old files, restart the Node app. Webhook URLs
  don't change on rollback (they point at the API subdomain).

---

## 12. Quick reference

**Production URLs**
```
SPA root:          https://chooseyour100.com/
API health:        https://api.chooseyour100.com/api/health
Google callback:   https://api.chooseyour100.com/api/auth/google/callback
Strava callback:   https://api.chooseyour100.com/api/integrations/strava/callback
Strava webhook:    https://api.chooseyour100.com/api/webhooks/strava
Telegram webhook:  https://api.chooseyour100.com/api/webhooks/telegram
```

**Commands (from `server/` on your machine — run locally)**
```bash
npm test                                   # 44 tests
npm run telegram:setwebhook -- set https://api.chooseyour100.com/api/webhooks/telegram
npm run telegram:webhook:info
npm run telegram:setup
npm run strava:subscribe -- create https://api.chooseyour100.com/api/webhooks/strava
npm run strava:subscribe -- list
```

**Client build**
```bash
cd client && VITE_API_URL=https://api.chooseyour100.com npm run build
```

**DB access (cPanel)**
```
DB: chooseyo_the100_prod | user: chooseyo_the100_app
pass: <db-password>   (.env: "<db-password>" · cPanel UI: as-is · shell: '<db-password>')
```