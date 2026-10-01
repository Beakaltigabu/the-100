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

### Phase D — THE 100 BOT (personal companion) ✅ COMPLETE
> Redesigned per the BOT spec (2026-09-28). See `THE-100-BOT-TEST-MATRIX.md`.
- Foundation: `bot_state` + `bot_settings` migrations, `callback_query` routing + inline keyboards, English-only messaging, `botGroupGuard` (community-group-only + ≤4/week cap), `sendToUser` markup support.
- Personal companion: home (active/not-started/completed), My Progress, guided log flow (type→distance→date→confirm), goal-adaptive milestones, Strava state + connect, completion + WHAT'S NEXT, community pulse, settings, share → website community post, People-like-you (same activity+goal, unranked), onboarding (YOU'RE IN → SEE MY 100 → tracking choice → READY), command shortcuts.
- Private notifications (6 categories): activity confirmation (Strava), milestone celebration, challenge-day moments (1/10/25/50/75/90/99/100), weekly recap, re-engagement (cooldown + reminders setting), completion — settings-gated.
- Group catalyst (≤4/week): rotating conversation starters, collective-distance thresholds, curated member moments (first step / major milestone / finish), group challenge moments, new-member welcome. Daily digest + per-event broadcasts removed. No-HQ enforced architecturally.
- `/language` + bilingual group messaging removed from the bot UX (website stays bilingual).

### Phase E — Admin panel
- Analytics (DAU/MAU, activities/km, enrollment funnel).
- User management (suspend/ban, delete, edit, role).
- System health + control (scheduler "run now", log flush, DB stats, version).

### Phase F — Dashboard redesign (psychology-backed) 🆕
- Single focal hierarchy: streak/chain → "Today's move" (primary CTA + quick-log presets) → progress identity (ring + chain + %) → Why (collapsible) → 7-day sparkline → community pulse → milestone path → quick-log flow.
- Streak strip ("don't break the chain" — loss aversion); next-milestone/finish distance (goal-gradient); post-log feedback; empty-state countdown + day-1 preview (endowed progress).
- Mostly client-side + a few small aggregates.

### Phase G — Community page rehaul 🆕
- Weekly movers board + streak leaderboard; comments/replies; multiple reactions; member spotlight; cross-post to Telegram group (opt-in); badges & achievements; shared "Our 100" community ring; daily prompts; follow members; community search; bookmarks; events & meetups (RSVP); weekly in-app digest; upgraded/pinned announcements.
- **Excluded by decision:** crews/accountability groups, buddy pairing, photo/media check-ins.

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

### ✅ Bot — THE 100 BOT (Phase D, complete — see `THE-100-BOT-TEST-MATRIX.md`)
- [x] `callback_query` support (webhook + setwebhook `allowed_updates`) + `bot_state`/`bot_settings`
- [x] Keyboard builders + button menu + command shortcuts
- [x] Guided log flow (type → distance → date → confirm)
- [x] Home/progress/milestones/strava/completion/settings/community-pulse screens
- [x] Onboarding (deep-link) + share → website community post + People-like-you
- [x] Private notifications (6 categories) + challenge-day moments + weekly recap + re-engagement cooldown
- [x] Group catalyst (≤4/week): starters, collective distance, member moments, challenge moments; no-HQ guard

### 🟡 P2 — Admin panel (Phase E)
- [x] Analytics endpoint + page
- [x] User management actions (ban/delete/edit/role)
- [x] System health/control (scheduler "run now", log flush, DB stats, version)
- [x] List pagination, filters, date selectors (audit/logs/support/members/broadcasts)

### 🔵 P1 — Dashboard redesign (Phase F)
- [ ] Focal hierarchy + "Today's move" primary CTA + quick-log presets
- [ ] Streak strip + next-milestone/finish distance readout
- [ ] 7-day sparkline + post-log feedback animation
- [ ] Collapsible "Why" + community pulse snippet + empty-state countdown
- [ ] i18n / dark mode / a11y / client build + manual verify

### 🟢 P2 — Community rehaul (Phase G)
- [x] Weekly movers board + streak leaderboard
- [x] Comments/replies + multiple reactions
- [x] Member spotlight + badges & achievements
- [x] Shared "Our 100" ring + daily prompts
- [x] Follow members + community search + bookmarks
- [x] Cross-post to Telegram (opt-in) + weekly in-app digest
- [x] Events & meetups (RSVP) + upgraded/pinned announcements
- [x] Pass 4: streak strip + social proof ticker + composer prominence + follow system
- [x] Pass 5: badges/achievements + community challenges + leaderboard
- [x] Pass 6: daily quest + weekly recap/digest + celebration confetti + events + cross-post

---

## 4. Decisions locked
- Channels: in-app + push + Telegram (no email for now)
- Roles: single admin role
- Broadcast targeting: full segments (Phase C); MVP = all users
- Scheduling: now + scheduled (Phase C); MVP = now only
- Preferences: per-user opt-out per channel/type
- Bot: THE 100 BOT personal companion ✅ (button-first, English-only, 6 notification categories, group catalyst ≤4/week, no-HQ guard)
- Dashboard: single focal action ("Today's move") + streaks + next-milestone framing; psychology-backed (loss aversion, goal-gradient, mastery, commitment, social proof)
- Community: include weekly movers, comments, reactions, spotlight, badges, "Our 100", prompts, follow, search, bookmarks, events, digest, pinned announcements; **exclude crews, buddy pairing, photo/media check-ins**
