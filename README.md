# THE 100

> **100 days. Your goal. Your commitment.**

A mobile-first PWA for a 100-day physical-activity challenge. Choose a goal,
commit for 100 days, log progress, hit milestones, join the community.

Built with the **MERN stack + MySQL** (React + Express + Node, JavaScript/JSX)
per the product spec in `the-100-brand-and-app-design.md`.
Full build plan: `THE-100-IMPLEMENTATION-PLAN.md`.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, React Router, PWA (vite-plugin-pwa) |
| Backend | Node + Express, JWT httpOnly cookies, bcrypt, zod |
| Database | MySQL 8.4 (Knex migrations), Laragon local server |
| i18n | English + Amharic (toggle, persisted) |
| Theme | Light + Dark (toggle, persisted, follows system default) |

## Features

- **Auth** — register / login / logout, httpOnly JWT cookie
- **Onboarding** — activity → experience → baseline → goal recommendation → choose
- **Commitment** — `YOUR 100` confirmation screen, `I'M IN`
- **Dashboard** — big number, progress bar, this-week stats, next milestone, quick actions
- **Activity** — manual logging with duplicate-overlap warning, list grouped by day
- **Milestones** — 10/50/100/250/500/750/1000 km auto-detected + notifications
- **Community** — THE 100 aggregates (members, check-ins, milestones, finishers)
- **Profile** — editable profile, goal + progress, integration status
- **Admin** — stats, member table with on-track status, member detail
- **Integrations (gated on keys)** — Strava OAuth + webhooks, Telegram bot link flow
- **Notifications** — welcome, commitment, milestone, weekly check-in, inactivity, finish
- **PWA** — installable manifest, generated icons, service worker, offline shell

## Prerequisites

- Node 20+ (tested on 26)
- MySQL 8 running locally (e.g. Laragon) on `127.0.0.1:3306`, user `root`, no password
  (override via `db/.env` / `server/.env`)

## Setup

```bash
# 1. Install dependencies (root, db, server, client)
npm install
npm --prefix db install
npm --prefix server install
npm --prefix client install

# 2. Create the database, run migrations, seed (admin + default challenge)
npm run db:reset

# 3. Configure server env (JWT secret + encryption key)
#    server/.env is already created for local dev; edit as needed.

# 4. Run server (:4000) + client (:5173)
npm run dev
```

Open http://localhost:5173

Seeded admin: `admin@the100.app` / `Admin123!`

## Useful scripts

| Command | What it does |
|---|---|
| `npm run db:reset` | create DB + migrate + seed |
| `npm run dev` | run API + client concurrently |
| `npm run build` | production build + PWA output |
| `npm test` | server unit tests (Vitest) |
| `npm --prefix client run icons` | regenerate PWA icons from SVG |
| `npm --prefix db run migrate:rollback` | roll back the last migration |

## Environment variables

See `server/.env.example` for the full list. Key ones:

- `JWT_SECRET`, `ENCRYPTION_KEY` — set strong random values in production
- `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` / `STRAVA_VERIFY_TOKEN` — enable Strava
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` — enable Telegram linking

Without integration keys the app runs fully; the Strava/Telegram connect buttons
show a friendly "not configured" message.

## Architecture

```
React (client :5173) ──/api proxy──▶ Express (server :4000) ──▶ MySQL (the100)
                                         │
                                    ┌────┴────┐
                                   Strava   Telegram
                              (OAuth/webhooks)  (bot webhooks)
```

- Progress = `SUM(distance)` over `challenge_activities` per enrollment.
- Milestones are recomputed on every logged activity.
- Strava/Telegram secrets and tokens stay server-side (AES-256-GCM at rest).
- Webhook heavy work is queued asynchronously.

## Project layout

```
db/        knex migrations + seed
server/    Express API, services, routes, webhooks, tests
client/    React PWA (pages, components, i18n, theme, api)
```

## Language & Theme

- **Language**: toggle EN / አማርኛ in the top bar (persisted, defaults to browser lang).
- **Theme**: toggle ☾ / ☀ in the top bar (persisted, follows system preference).