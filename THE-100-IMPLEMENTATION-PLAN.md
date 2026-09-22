# THE 100 — Implementation Plan & Roadmap

> **Urgent priority:** Strava integration has hit API limitations and members are currently unable to connect. We need the **admin broadcast** feature deployed immediately to notify members system-wide.

---

## 1. Immediate priority — Admin broadcast (deploy now)

Notify members (in-app + Telegram + group) that Strava connection is temporarily limited and manual logging is available.

### Scope (MVP)
- Admin composes a title + body (EN, optional AM), picks channels (in-app / Telegram DM / Telegram group), sends immediately to all users.
- Server fans out: writes an in-app `notifications` row per user, enqueues a Telegram DM per linked user, posts once to the group.
- Records the broadcast in a `broadcasts` table for history.

### Files
| Area | File | Change |
|---|---|---|
| DB | `db/migrations/20260922000000_broadcasts.js` | New `broadcasts` table + widen `notifications.type` enum |
| Constants | `server/src/constants.js` | Add `announcement` (and future broadcast types) to `NOTIFICATION_TYPES` |
| Service | `server/src/services/broadcast.js` | `sendBroadcast()` — resolve targets, batch in-app insert, enqueue Telegram DMs, group post |
| Route | `server/src/routes/admin.js` | `POST /broadcast` (send) + `GET /broadcasts` (history) |
| Client | `client/src/pages/admin/AdminBroadcast.jsx` | Compose form + recent broadcasts list |
| Client | `client/src/pages/admin/AdminNav.jsx`, `client/src/App.jsx`, `translations.js` | Nav link + route + i18n strings |

### Deploy steps
1. Upload `server/src` (+ the new migration) and `client/dist`.
2. Apply the migration to prod: set `AUTO_MIGRATE=true` once, restart, then back to `false` — or run the SQL in phpMyAdmin.
3. Verify: `POST /api/admin/broadcast` with a test title reaches the Telegram group + writes in-app rows.

---

## 2. Full roadmap (phased)

### Phase A — Notifications foundation
- **Channel dispatcher**: `createNotification()` fans out to in-app + push + Telegram (unifies push, bot nudges, broadcast).
- **Preferences table** (`notification_preferences`): per-user opt-out per channel + type.
- **In-app notification center**: `NotificationBell` + dropdown + unread count + polling.

### Phase B — Push + single subscription banner
- `web-push` + VAPID keys + `push_subscriptions` table.
- Custom service worker (`injectManifest`) with `push`/`notificationclick` handlers.
- One banner (mirror `InstallBanner`) → permission + subscribe + in-app opt-in.

### Phase C — Broadcast (full)
- Segments (language, activity type, enrollment status, active/inactive), scheduling, delivery tracking (`broadcast_recipients`).

### Phase D — Bot enrichment (button-based)
- `callback_query` support + inline-keyboard menu.
- Button-based guided check-in (quick-pick + custom distance via `bot_state`).
- Richer commands (`/progress`, `/history`, `/next`).
- Daily personalized reminders (`preferred_time` + `schedule_days`).
- Admin suite: `/admin`, `/trigger`, `/nudge`, `/broadcast`, `/block`, `/users`.
- Group enrichment: weekly activity board + member spotlight.

### Phase E — Admin panel
- Analytics (DAU/MAU, activities/km, enrollment funnel).
- User management (suspend/ban, delete, edit, role).
- System health + control (scheduler "run now", log flush, DB stats, version).

---

## 3. Todo list

### 🔴 P0 — Broadcast (deploy now)
- [ ] Migration: `broadcasts` table + widen `notifications.type` enum
- [ ] `constants.js`: add `announcement` to `NOTIFICATION_TYPES`
- [ ] `services/broadcast.js`: `sendBroadcast()`
- [ ] `routes/admin.js`: `POST /broadcast` + `GET /broadcasts`
- [ ] Client `AdminBroadcast.jsx` + nav + route + i18n
- [ ] Server tests + client build
- [ ] Regenerate `db/schema.sql`
- [ ] Apply migration to prod + deploy + verify

### 🟠 P1 — Notifications (Phase A)
- [ ] Channel dispatcher in `notifications.js`
- [ ] `notification_preferences` table
- [ ] `GET /api/notifications` unread count + per-item read
- [ ] `NotificationBell` UI + polling
- [ ] Preferences settings UI

### 🟠 P1 — Push + banner (Phase B)
- [ ] VAPID keys + `web-push` dep + `push_subscriptions`
- [ ] Custom SW (`injectManifest`) with push handler
- [ ] `POST/DELETE /api/push/subscribe`
- [ ] Subscription banner + permission flow

### 🟡 P2 — Bot enrichment (Phase D)
- [ ] `callback_query` support (webhook + setwebhook `allowed_updates`)
- [ ] Keyboard builders + button menu
- [ ] Button-based check-in + `bot_state` table
- [ ] `/progress`, `/history`, `/next`
- [ ] Daily reminders job (`sendDailyReminders`)
- [ ] Admin resolver + `/admin` suite + manual trigger endpoint
- [ ] Weekly activity board + member spotlight

### 🟡 P2 — Admin panel (Phase E)
- [ ] Analytics endpoint + page
- [ ] User management actions (ban/delete/edit/role)
- [ ] System health/control (scheduler "run now", log flush, DB stats, version)

---

## 4. Decisions locked
- Channels: in-app + push + Telegram (no email for now)
- Roles: single admin role
- Broadcast targeting: full segments (Phase C); MVP = all users
- Scheduling: now + scheduled (Phase C); MVP = now only
- Preferences: per-user opt-out per channel/type
- Bot: button-based UI, guided check-in, no in-bot onboarding (stays on the app)
