# THE 100 — Implementation Plan

**Stack**: React (JSX) + Vite + Express + Node + MySQL (MERN with MySQL, JavaScript — no TypeScript)
**Project root**: `Running90/`
**Reference**: `the-100-brand-and-app-design.md` (brand + product spec)
**Database**: Local MySQL 8.4 via Laragon (port 3306, user `root`, empty password)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repository Layout](#2-repository-layout)
3. [Database Schema (MySQL)](#3-database-schema-mysql)
4. [API Reference](#4-api-reference)
5. [Design System](#5-design-system)
6. [Phase 1 — Foundation](#6-phase-1--foundation)
7. [Phase 2 — Onboarding](#7-phase-2--onboarding)
8. [Phase 3 — Challenge & Commitment](#8-phase-3--challenge--commitment)
9. [Phase 4 — Dashboard & Activity](#9-phase-4--dashboard--activity)
10. [Phase 5 — Community](#10-phase-5--community)
11. [Phase 6 — Integrations (Strava + Telegram)](#11-phase-6--integrations-strava--telegram)
12. [Phase 7 — Admin](#12-phase-7--admin)
13. [Phase 8 — Notifications & PWA](#13-phase-8--notifications--pwa)
14. [Phase 9 — Testing & Documentation](#14-phase-9--testing--documentation)
15. [Configuration & Environment](#15-configuration--environment)
16. [Verification Checklist (Final)](#16-verification-checklist-final)

---

## 1. Architecture Overview

```
               SOCIAL (Instagram/TikTok)
                        │
                        ▼
                 LANDING PAGE            ← React SPA (Vite + PWA)
                        │
                        ▼
                   REGISTRATION
                        │
                        ▼
                    ONBOARDING           (activity → experience → baseline → goal)
                        │
                 ┌──────┴──────┐
                 ▼             ▼
            STRAVA          TELEGRAM
          integration       community
                 │             │
                 └──────┬──────┘
                        ▼
                   THE 100 APP
                 (dashboard/progress/
                  activity/profile)
                        │
                        ▼
                   ADMIN SYSTEM

  React (client:5173)  →  Express API (server:4000)  →  MySQL 8.4 (3306)
                                    │
                          ┌─────────┴─────────┐
                          ▼                   ▼
                       Strava             Telegram
                   OAuth/Webhooks       Bot API
```

**Guiding principle** (`spec §50`): build the smallest system that supports
`JOIN → COMMIT → MOVE → LOG → PROGRESS → CONNECT → FINISH`.

**Product principle** (`spec §52`): the app must answer instantly —
- Where am I? → `327 / 1,000 KM`
- What do I need to do? → `Keep moving.`
- Who is doing this with me? → `THE 100.`

**Non-goals for V1** (`spec §47`): no social feed, comments, likes, gamification,
DMs, Strava leaderboards, Strava feed across users, AI analysis, GPS, payments.

---

## 2. Repository Layout

```
Running90/
├── package.json                  # root orchestration scripts (concurrently)
├── README.md
├── .gitignore
├── THE-100-IMPLEMENTATION-PLAN.md  (this file)
│
├── db/
│   ├── package.json              # knex CLI dep
│   ├── knexfile.js               # knex config (reads env)
│   ├── setup.js                  # CREATE DATABASE IF NOT EXISTS the100
│   ├── migrations/
│   │   └── 20260912000000_init.js
│   └── seeds/
│       └── 01_defaults.js        # default challenge + admin
│
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.js              # bootstrap (http listen)
│   │   ├── app.js                # express app assembly
│   │   ├── config.js             # env parsing
│   │   ├── db.js                 # knex instance
│   │   ├── constants.js          # milestone thresholds, goal bands, enums
│   │   ├── middleware/
│   │   │   ├── auth.js           # requireAuth, requireAdmin
│   │   │   ├── errors.js         # asyncHandler, AppError, errorHandler, notFound
│   │   │   └── rateLimit.js      # per-route rate limits
│   │   ├── routes/
│   │   │   ├── auth.js           # register/login/logout/me
│   │   │   ├── onboarding.js     # baseline + goal recommendation
│   │   │   ├── challenges.js     # enroll, current, commitment
│   │   │   ├── activities.js     # manual log, list, delete
│   │   │   ├── progress.js       # dashboard aggregate
│   │   │   ├── milestones.js     # list + recently reached
│   │   │   ├── profile.js        # get/update profile
│   │   │   ├── community.js      # THE 100 stats + telegram status
│   │   │   ├── admin.js          # stats, member table, member detail
│   │   │   ├── integrations/
│   │   │   │   ├── strava.js     # connect/callback/disconnect/status/activities
│   │   │   │   └── telegram.js   # connect (one-time token)/status
│   │   │   └── webhooks/
│   │   │       ├── strava.js     # hub.challenge verify + event processing
│   │   │       └── telegram.js   # /start, /status bot commands
│   │   ├── services/
│   │   │   ├── progress.js       # total, week, day, on-track, milestones
│   │   │   ├── milestones.js     # detect + insert reached milestones
│   │   │   ├── strava.js         # token encrypt/decrypt, OAuth, fetch, webhook
│   │   │   ├── telegram.js       # link-token gen, bot message handling
│   │   │   ├── notifications.js  # create notification records
│   │   │   └── queue.js          # in-memory async queue for webhooks
│   │   └── lib/
│   │       ├── crypto.js         # AES-256-GCM encrypt/decrypt
│   │       ├── tokens.js         # random token gen + sha256 hash
│   │       └── dates.js          # day-number calc, week boundaries
│   └── tests/
│       ├── progress.test.js
│       ├── milestones.test.js
│       └── dedupe.test.js
│
└── client/
    ├── package.json
    ├── vite.config.js            # react + PWA + /api proxy
    ├── index.html
    ├── public/
    │   └── icon.svg              # source icon
    ├── scripts/
    │   └── generate-icons.mjs    # sharp: svg → pwa-192/512 + maskable
    └── src/
        ├── main.jsx
        ├── App.jsx               # router
        ├── styles/
        │   ├── tokens.css        # design tokens (colors, spacing, type)
        │   └── global.css        # base + utilities
        ├── api/
        │   └── client.js         # fetch wrapper (credentials: include)
        ├── context/
        │   └── AuthContext.jsx   # user state, login/logout/refresh
        ├── hooks/
        │   └── useAuth.js
        ├── components/
        │   ├── Button.jsx  Card.jsx  ProgressBar.jsx  Stat.jsx
        │   ├── Milestone.jsx  ActivityRow.jsx  GoalCard.jsx
        │   ├── StatusBadge.jsx  Modal.jsx  Toast.jsx
        │   ├── Navigation.jsx  BottomNav.jsx
        │   ├── EmptyState.jsx  LoadingState.jsx  ErrorState.jsx
        │   └── ProtectedRoute.jsx  AdminRoute.jsx
        └── pages/
            ├── Landing.jsx  Register.jsx  Login.jsx
            ├── Onboarding.jsx      # multi-step
            ├── Commitment.jsx
            ├── Dashboard.jsx
            ├── Progress.jsx
            ├── Activity.jsx
            ├── Community.jsx
            ├── Profile.jsx
            └── admin/  AdminHome.jsx  AdminMembers.jsx
```

---

## 3. Database Schema (MySQL)

Database name: **`the100`**. Engine `InnoDB`, charset `utf8mb4`.

### `users`
| column | type | notes |
|---|---|---|
| id | BIGINT PK AI | |
| name | VARCHAR(120) NOT NULL | |
| email | VARCHAR(255) NOT NULL UNIQUE | |
| password_hash | VARCHAR(255) NOT NULL | bcrypt |
| photo_url | VARCHAR(255) NULL | |
| location | VARCHAR(120) NULL | |
| age | INT NULL | |
| social_handle | VARCHAR(120) NULL | |
| experience_level | ENUM('beginner','occasional','consistent','experienced') NULL | onboarding |
| weekly_baseline_km | DECIMAL(6,2) NULL | onboarding |
| activity_type | ENUM('running','walking','run_walk','cycling','other') NULL | onboarding |
| onboarding_complete | BOOLEAN DEFAULT FALSE | |
| created_at / updated_at | TIMESTAMP | |

### `admins`
| column | type | notes |
|---|---|---|
| id | BIGINT PK AI | |
| user_id | BIGINT UNIQUE NOT NULL FK→users | |
| role | ENUM('owner','admin') DEFAULT 'admin' | |
| created_at | TIMESTAMP | |

### `challenges`
| column | type | notes |
|---|---|---|
| id | BIGINT PK AI | |
| name | VARCHAR(120) NOT NULL | e.g. "THE 100" |
| description | TEXT NULL | |
| start_date | DATE NOT NULL | |
| end_date | DATE NOT NULL | start + 99 days |
| is_active | BOOLEAN DEFAULT TRUE | |
| created_at | TIMESTAMP | |

### `enrollments`
| column | type | notes |
|---|---|---|
| id | BIGINT PK AI | |
| user_id | BIGINT NOT NULL FK→users | |
| challenge_id | BIGINT NOT NULL FK→challenges | |
| activity_type | ENUM(...) NOT NULL | |
| goal_distance | DECIMAL(8,2) NOT NULL | chosen km |
| start_date | DATE NOT NULL | |
| end_date | DATE NOT NULL | |
| status | ENUM('committed','active','completed','abandoned') DEFAULT 'committed' | |
| completed_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |
| **UNIQUE** | (user_id, challenge_id) | one enrollment per challenge |

### `challenge_activities`
| column | type | notes |
|---|---|---|
| id | BIGINT PK AI | |
| enrollment_id | BIGINT NOT NULL FK→enrollments | |
| date | DATE NOT NULL | |
| distance | DECIMAL(8,2) NOT NULL | km |
| activity_type | ENUM(...) NOT NULL | |
| source | ENUM('manual','strava') DEFAULT 'manual' | |
| strava_activity_id | BIGINT NULL UNIQUE | dedupe key (multiple NULLs OK) |
| notes | VARCHAR(255) NULL | |
| created_at | TIMESTAMP | |
| index | (enrollment_id, date) | dashboard week queries |

### `milestones`
| column | type | notes |
|---|---|---|
| id | BIGINT PK AI | |
| enrollment_id | BIGINT NOT NULL FK→enrollments | |
| threshold | DECIMAL(8,2) NOT NULL | 10/50/100/250/500/750/1000 |
| reached_at | TIMESTAMP NULL | set when crossed |
| notified_at | TIMESTAMP NULL | |
| **UNIQUE** | (enrollment_id, threshold) | |

### `telegram_connections`
| column | type | notes |
|---|---|---|
| id | BIGINT PK AI | |
| user_id | BIGINT UNIQUE NOT NULL FK→users | |
| telegram_user_id | BIGINT NULL | |
| state | ENUM('not_connected','invite_generated','join_requested','approved','active','left','removed') DEFAULT 'not_connected' | |
| link_token_hash | VARCHAR(64) NULL | sha256 |
| link_expires_at | TIMESTAMP NULL | 15 min TTL |
| created_at / updated_at | TIMESTAMP | |

### `strava_connections`
| column | type | notes |
|---|---|---|
| id | BIGINT PK AI | |
| user_id | BIGINT UNIQUE NOT NULL FK→users | |
| strava_athlete_id | BIGINT NULL | |
| encrypted_access_token | TEXT NULL | AES-256-GCM |
| encrypted_refresh_token | TEXT NULL | AES-256-GCM |
| token_expires_at | TIMESTAMP NULL | |
| scope | VARCHAR(255) NULL | |
| status | ENUM('connected','disconnected') DEFAULT 'connected' | |
| connected_at / disconnected_at | TIMESTAMP NULL | |
| created_at / updated_at | TIMESTAMP | |

### `notifications`
| column | type | notes |
|---|---|---|
| id | BIGINT PK AI | |
| user_id | BIGINT NOT NULL FK→users | |
| type | ENUM('welcome','commitment','milestone','weekly_checkin','inactivity','finish') | |
| title | VARCHAR(120) NOT NULL | |
| body | TEXT NOT NULL | |
| channel | ENUM('web','email','telegram') DEFAULT 'web' | |
| read_at | TIMESTAMP NULL | |
| sent_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |

**Milestone thresholds** (code constant, `server/src/constants.js`):
`[10, 50, 100, 250, 500, 750, 1000]`

**Goal bands** for recommendation (`spec §10`):
| level | km | |
|---|---|---|
| START | 50 | |
| BUILD | 100 | |
| COMMIT | 250 | |
| PUSH | 500 | |
| EXTREME | 750 | |
| 1K | 1000 | |

---

## 4. API Reference

All responses JSON. Auth via **httpOnly cookie** `the100_token` (JWT, SameSite=Lax).

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/health` | — | liveness |
| POST | `/api/auth/register` | — | create account {name,email,password} |
| POST | `/api/auth/login` | — | {email,password} → sets cookie |
| POST | `/api/auth/logout` | ✓ | clears cookie |
| GET | `/api/me` | ✓ | current user + admin flag |
| PUT | `/api/onboarding` | ✓ | save {activity_type,experience_level,weekly_baseline_km} |
| GET | `/api/onboarding/recommendations` | ✓ | goal bands for baseline |
| POST | `/api/challenges/enroll` | ✓ | commit {goal_distance,activity_type} → enrollment |
| GET | `/api/challenges/current` | ✓ | active challenge + user's enrollment |
| GET | `/api/progress` | ✓ | dashboard aggregate (below) |
| POST | `/api/activities/manual` | ✓ | log {date,distance,activity_type,notes} |
| GET | `/api/activities` | ✓ | own activities (paginated) |
| DELETE | `/api/activities/:id` | ✓ | delete manual activity |
| GET | `/api/milestones` | ✓ | own milestones |
| GET | `/api/profile` | ✓ | profile + integration status |
| PUT | `/api/profile` | ✓ | update {name,location,age,social_handle} |
| GET | `/api/community/stats` | ✓ | THE 100 aggregates (own-data only) |
| GET | `/api/integrations/strava/connect` | ✓ | redirect to Strava OAuth |
| GET | `/api/integrations/strava/callback` | — | OAuth exchange → redirect to client |
| POST | `/api/integrations/strava/disconnect` | ✓ | revoke + clear tokens |
| GET | `/api/integrations/strava/status` | ✓ | connection state (no tokens) |
| GET | `/api/integrations/strava/activities` | ✓ | own Strava-sourced activities |
| GET | `/api/integrations/telegram/connect` | ✓ | generate one-time deep-link token |
| GET | `/api/integrations/telegram/status` | ✓ | state + bot username |
| POST | `/api/webhooks/strava` | secret | activity create/update/delete, deauth |
| GET | `/api/webhooks/strava` | secret | Strava `hub.challenge` verification |
| POST | `/api/webhooks/telegram` | secret | Telegram bot updates |
| GET | `/api/admin/stats` | admin | member/active/telegram/strava/completed counts |
| GET | `/api/admin/members` | admin | member table |
| GET | `/api/admin/members/:id` | admin | member detail |
| GET | `/api/notifications` | ✓ | own notifications |

### `GET /api/progress` response shape
```json
{
  "enrollment": { "id": 1, "goalDistance": 250, "startDate": "...", "endDate": "...",
                  "activityType": "running", "status": "active", "day": 38, "totalDays": 100 },
  "totalKm": 327,
  "percent": 32.7,
  "thisWeekKm": 42.8,
  "thisWeekActivities": 4,
  "nextMilestone": { "threshold": 500, "remaining": 173 },
  "milestones": [ { "threshold": 10, "reached": true }, ... ],
  "status": "on_track"
}
```

---

## 5. Design System

### Tokens (`client/src/styles/tokens.css`)
```css
--color-ink: #101010;        /* near black, bg + text */
--color-paper: #F5F3EE;      /* warm white, surface */
--color-accent: #FF4D00;     /* vivid orange/red */
--color-muted: #6E6E66;
--color-success: #22C55E;
--color-line: rgba(16,16,16,0.12);
--radius: 14px;
--space-1..8: 4/8/12/16/24/32/48/64 px
--font-display: "Inter", "Geist", "Manrope", system-ui, sans-serif;
```

### Principles (`spec §23, §40`)
- Editorial + athletic + modern; **NOT** Strava-like.
- Large numbers dominate (`327`), generous whitespace, strong type, bold progress.
- Mobile-first; bottom nav on mobile; top nav on ≥900px.
- High contrast: ink on paper; accent used sparingly.

### Component list (`spec §41`)
Button, Card, ProgressBar, Stat, Milestone, ActivityRow, GoalCard, StatusBadge,
Modal, Toast, Navigation, BottomNav, EmptyState, LoadingState, ErrorState.
Plus ProtectedRoute, AdminRoute.

### Bottom navigation (`spec §42`)
`HOME · PROGRESS · ACTIVITY · COMMUNITY · PROFILE`

### i18n — Bilingual (English / Amharic)
- `client/src/i18n/translations.js` holds full `en` + `am` dictionaries.
- `LanguageProvider` (`client/src/context/LanguageContext.jsx`) exposes
  `{ lang, setLang, t(key, vars) }`; `t` supports `{placeholder}` interpolation.
- Persisted in `localStorage` (`the100_lang`); defaults to the browser language
  (Amharic browsers get Amharic).
- A `EN / አማ` toggle lives in the top bar.
- All UI strings across pages/components go through `t()`.

### Theme — Dark / Light
- `client/src/styles/tokens.css` defines light defaults and a
  `[data-theme='dark']` override block (near-black `#101010` surface, warm-white
  ink, brighter accent `#FF6B2C`).
- `ThemeProvider` (`client/src/context/ThemeContext.jsx`) exposes
  `{ theme, toggleTheme, isDark }`; persists in `localStorage` (`the100_theme`)
  and follows the OS `prefers-color-scheme` on first load.
- A `☾ / ☀` toggle lives in the top bar; `meta[name=theme-color]` updates live.

---

## 6. Phase 1 — Foundation

### Tasks
1. Scaffold repo: `db/`, `server/`, `client/` folders + root `package.json` scripts.
2. DB: `db/setup.js` (create DB), `db/knexfile.js`, init migration (all tables),
   seed (default challenge + admin account).
3. Server base: `config.js`, `db.js`, `constants.js`, `app.js` (cors, json, cookie
   parser, routes, error handler), `index.js`.
4. Auth: bcryptjs hashing, JWT in httpOnly cookie; `register/login/logout/me`;
   `requireAuth`, `requireAdmin` middleware.
5. Client scaffold: Vite + React + react-router-dom + vite-plugin-pwa + `/api` proxy.
6. Design system: tokens.css (light + dark), global.css, core components.
7. i18n: Amharic/English dictionaries + `LanguageProvider` + toggle.
8. Theme: `ThemeProvider` + dark/light tokens + toggle.
9. App shell: AuthContext, ProtectedRoute, BottomNav, landing page.

### Check ✅
- `npm run db:reset` completes without error; all 9 tables exist.
- `curl` register → login → `GET /api/me` returns the user; logout clears cookie.
- `client` dev server serves landing page; design tokens visible.

---

## 7. Phase 2 — Onboarding

Screens (`spec §8–9`):
1. **Activity** — What are you committing to? → running/walking/run_walk/cycling/other
2. **Experience** — Where are you starting from? → beginner/occasional/consistent/experienced
3. **Baseline** — How much each week? → `<10, 10–20, 20–40, 40–60, 60–80, 80+ km`
4. **Recommendation** — backend derives comfortable/challenging/serious/extreme goal cards
5. **Choose goal** — user picks one

### API
- `PUT /api/onboarding` saves fields + `onboarding_complete=true`.
- `GET /api/onboarding/recommendations` returns goal cards computed from `weekly_baseline_km`.

### Recommendation logic
```
baseline_km   → [comfortable, challenging, serious, extreme]
<10           →  50, 100, 250, 500
10–20         →  100, 250, 500, 1000
20–40         →  250, 500, 750, 1000
40+           →  250, 500, 1000, 1000
```
Advisory only; user free to pick any band.

### Check ✅
- Completing flow sets user fields; recommendations shift with baseline.

---

## 8. Phase 3 — Challenge & Commitment

### API
- `POST /api/challenges/enroll` → validates active challenge, creates enrollment
  (status `committed`), computes dates from challenge window, creates milestone
  rows, queues a commitment notification.
- `GET /api/challenges/current` → active challenge + user enrollment.
- Day counter service: `day = floor((today - start)/1day) + 1`, clamp `[1,100]`.

### Client
- **Commitment screen** (`spec §10`): big `YOUR 100`, goal, `100 DAYS`, start/finish
  dates, primary CTA `I'M IN`, secondary `CHANGE MY GOAL`.
- On success → toast `Your 100 starts now.` → route to dashboard.

### Check ✅
- Enrollment row + milestone rows created; Day counter = 1 on start date.

---

## 9. Phase 4 — Dashboard & Activity

### APIs
- `GET /api/progress` — totals, this-week, next milestone, day, on-track status.
- `POST /api/activities/manual` — insert, recompute milestones, dedupe guard
  (warn if same-day Strava activity exists).
- `GET /api/activities`, `DELETE /api/activities/:id`.
- `GET /api/milestones`.

### Dashboard layout (`spec §19`)
```
YOUR 100
327 KM  (of 1,000 KM)
████████░░░░  32.7%
DAY 38 / 100
--- This Week: 42.8 KM · 4 activities
--- Next Milestone: 500 KM (173 KM remaining)
--- Quick Actions: LOG ACTIVITY · CONNECT STRAVA · OPEN TELEGRAM
```

### Activity page (`spec §21`)
Manual log form: distance, activity radio, date, submit. List grouped by day
(`spec §20` style: TODAY / YESTERDAY / SEP 9). Delete with confirm.

### Profile page (`spec §24`)
Name, goal, progress, milestones checklist, Telegram/Strava status.

### Check ✅
- Logging 8.4 km updates total, percent, this-week, and fires milestone when
  crossing a threshold (e.g. total crosses 10 → `YOU JUST HIT 10 KM.`).

---

## 10. Phase 5 — Community

### API
- `GET /api/community/stats` — **THE 100 own data only** (`spec §25`):
  total members, checked in today (≥1 activity today), milestones this week,
  finishers (status=completed). Never aggregates Strava data.

### Client
- Community page: `347 MEMBERS · TODAY 89 checked in · MILESTONES 37 · FINISHERS 23`
  plus Telegram status card (`spec §26`).

### Check ✅
- Counts match `users`/`enrollments`/`activities`/`milestones` tables directly.

---

## 11. Phase 6 — Integrations (Strava + Telegram)

Both integrations are **fully coded but gated on env keys**. When keys are absent,
endpoints return `503 { configured: false }` and UI shows a friendly message.

### Strava (`spec §14–17, §34–35`)
- `GET /api/integrations/strava/connect` → redirect to Strava authorize
  (`scope=activity:read`), `state` = signed `{userId}` (JWT).
- `callback` → POST `/oauth/token` exchange → encrypt + store tokens → fetch recent
  activities → import into `challenge_activities` (source=strava) → redirect to
  client `/profile?strava=connected`.
- `disconnect` → `POST /oauth/deauthorize` + delete tokens + set status.
- `status` → connected athlete id, scope, expiry (no tokens).
- `activities` → own Strava-sourced activities only.
- **Webhook** `GET` → validate `hub.verify_token` (env `STRAVA_VERIFY_TOKEN`),
  return `hub.challenge`. `POST` → verify `X-Hub-Signature` (HMAC-SHA1 of raw
  body with client secret) → enqueue to in-memory queue →
  `activity:create|update` fetch + import, `activity:delete` remove,
  `athlete:deauthorize` disconnect + delete cached data.
- Token encryption: AES-256-GCM, key from env `ENCRYPTION_KEY`.

### Telegram (`spec §11–13, §36–37`)
- `GET /api/integrations/telegram/connect` (auth) → generate crypto-random 32-byte
  token, store sha256 + expiry (15 min), return
  `https://t.me/<bot>?start=<token>`.
- `POST /api/webhooks/telegram` → validate via bot-token comparison (or HMAC) →
  handle:
  - `/start <token>` → validate one-time token → link `telegram_user_id`,
    state `active` → reply `Welcome to THE 100. Your goal: X KM ...`.
  - `/status` → reply enrollment summary.
- States flow: `not_connected → invite_generated → active → left/removed`
  (simplified from spec §13; `join_requested/approved` reserved for join-request mode).

### Client
- Profile/Community cards show connect buttons; if `configured:false`, show
  "Strava integration not configured yet".

### Check ✅
- With empty keys: connect endpoints return 503 gracefully, UI friendly message.
- With keys (future): full OAuth round-trip + webhook import + telegram link works.

---

## 12. Phase 7 — Admin

### API (all behind `requireAdmin`)
- `GET /api/admin/stats` — members, active, telegram connected, strava connected,
  completed, total distance logged (`spec §28`).
- `GET /api/admin/members` — table rows: name, goal, progress, day, status
  (on_track / falling_behind / inactive / completed), telegram, strava, joined.
- `GET /api/admin/members/:id` — detail (no raw Strava data).

### On-track logic (own challenge data only)
```
day_elapsed  = day number
expected     = goal * (day_elapsed / 100)
on_track     = total >= expected * 0.9
falling_behind = total < expected * 0.9  AND activities in last 7 days
inactive     = no activity in last 7 days
completed    = status === 'completed'
```

### Client
- `/admin` route guarded by `AdminRoute`. Two pages: Home (stat cards),
  Members (table, click row → detail).

### Check ✅
- Non-admin gets 403; admin sees correct stats and statuses.

---

## 13. Phase 8 — Notifications & PWA

### Notifications (`spec §31`)
- Service creates `notifications` rows:
  - welcome (on register)
  - commitment (on enroll)
  - milestone (on crossing threshold)
  - weekly_checkin (cron-scheduled stub, V1: exposed endpoint)
  - inactivity (cron-scheduled stub)
  - finish (on reaching goal / day 100)
- `GET /api/notifications` + mark-read. UI: bell dropdown on desktop, toast in-app.
- Channel: `web` first; Telegram/email left as future channels.

### PWA (`spec §38`)
- `vite-plugin-pwa` — `registerType: autoUpdate`, manifest:
  name THE 100, theme/background `#101010`, display standalone.
- Icons generated from `public/icon.svg` via `client/scripts/generate-icons.mjs`
  (sharp → 192, 512, maskable 512) into `public/icons/`.
- Service worker caches app shell; offline shows cached dashboard shell
  (Activity Logging offline queue documented as future work).

### Check ✅
- `npm run build` outputs valid PWA; Lighthouse-style manifest installable.
- Offline reload still shows the shell.

---

## 14. Phase 9 — Testing & Documentation

### Tests (Vitest, `server/tests/`)
- `progress.test.js` — total, percent, day-number, this-week boundaries, on-track.
- `milestones.test.js` — crossing thresholds creates milestone rows, no dupes.
- `dedupe.test.js` — manual+strava overlap detection.

### Docs
- `README.md` — setup, run, env vars, architecture summary.
- `server/.env.example` — full variable list.
- This plan file kept current.

### Check ✅
- `npm test` green. Manual end-to-end:
  register → onboarding → enroll → dashboard → log → milestone → community → admin.

---

## 15. Configuration & Environment

`server/.env.example`:
```
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=the100

JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=7d
COOKIE_SECURE=false

ENCRYPTION_KEY=32-byte-random-hex-for-token-encryption

# Strava (optional until provided)
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_VERIFY_TOKEN=
STRAVA_REDIRECT_URI=http://localhost:4000/api/integrations/strava/callback

# Telegram (optional until provided)
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
```

### Run commands
```bash
npm install                      # root (concurrently)
npm --prefix db install          # knex
npm --prefix server install      # express etc.
npm --prefix client install      # vite/react/pwa
npm run db:reset                 # create db + migrate + seed
npm run dev                      # server :4000 + client :5173
npm test                         # server unit tests
npm run build                    # client production + PWA
```

---

## 16. Verification Checklist (Final)

- [ ] `npm run db:reset` clean on fresh DB
- [ ] Register → onboarding → goal choice → commitment (I'M IN)
- [ ] Dashboard shows `YOUR 100`, big number, %, day, this week, next milestone
- [ ] Manual log updates progress; milestone toast fires on thresholds
- [ ] Dedupe guard warns on overlapping Strava activity
- [ ] Profile shows milestones checklist + integration status
- [ ] Community stats correct from own data
- [ ] Admin pages gated; stats/table/status correct
- [ ] Strava + Telegram gracefully "not configured" without keys
- [ ] PWA installable (`npm run build`), offline shell works
- [ ] `npm test` green
- [ ] No secrets in repo; all via `.env`
```
```
```
```