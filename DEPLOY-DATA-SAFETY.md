# THE 100 — Deploy Data-Safety Checklist

Goal: deploy the current code against the **live cPanel prod DB** (`chooseyo_the100_prod`)
without losing any existing data. Prod **already has data** (33 users, 33 enrollments,
26 Telegram connections, 7 Strava connections, active challenge 2026-09-23 → 2026-12-31).

## Verified against a copy of the real prod DB (this repo)

- [x] **Import**: `npm run db:import -- db/backups/chooseyo_the100_prod.sql the100_prodcopy`
      → clean copy; row-count manifest captured.
- [x] **16 pending migrations apply with zero data loss**:
      `npm run db:migrate -- the100_prodcopy`
      → all 16 applied; **every pre-existing table kept identical row counts**.
- [x] **Reversible**: `npm run db:rollback -- the100_prodcopy 2` then re-migrate → OK
      (`bot_state`, `bot_settings` have working `down()`).
- [x] **Full integration suite passes against the real schema**:
      `TEST_DB_NAME=the100_prodcopy npm test` → **140/140**.
- [x] **Live-data smoke**: bot progress / people-like-you / community pulse render the
      **real prod rows** (member Mihret, tg `5395833827`, real totals).
- [x] **`db/schema.sql` regenerated** to the current 39-table state (with `knex_migrations`
      state rows) for fresh rebuilds only.

## Deploy steps (execute in order)

### 1. Backup prod (rollback artifact)
- cPanel → Backups → **Download a MySQL Database Backup** → `chooseyo_the100_prod`
  → save locally (e.g., `db/backups/`). This is your rollback restore point.

### 2. Capture pre-migration row counts on prod
```bash
npm run db:manifest -- chooseyo_the100_prod   # needs prod DB access from this machine
```
If you can't reach prod MySQL remotely, capture counts in phpMyAdmin
(`SELECT COUNT(*) FROM <table>` for: users, enrollments, challenges, challenge_activities,
milestones, telegram_connections, strava_connections, community_posts, notifications, meta).

### 3. Deploy the code
- Upload `server/` (app root) + `client/dist` → `public_html` (see
  `THE-100-DEPLOYMENT-GUIDE.md` §4–5). Exclude `tests/`, `scripts/` dev scripts, `.env`.

### 4. Bring prod's schema current — **incrementally, never re-import the old schema**
- Prod is at **20 migrations**; current code is **36**. Bring it forward with the
  migration set (all additive — verified on the copy):
  - cPanel Node app env: set **`AUTO_MIGRATE=true`**, restart once, confirm the log
    shows `[migrate] done` + the 16 migration names, then set `AUTO_MIGRATE=false` and restart.
  - **Do NOT** re-import the old `db/schema.sql` over live data (that path is only for a
    fresh/empty DB rebuild).

### 5. Verify post-migration (no data loss)
- [ ] Row counts for all pre-existing tables are **identical** to step 2.
- [ ] New tables exist: `bot_state`, `bot_settings`, `badges`, `user_badges`,
      `events`, `event_participants`, `community_challenges`,
      `community_challenge_participants`, `broadcasts`, `broadcast_recipients`,
      `push_subscriptions`, `notification_preferences`, `community_comments`,
      `community_bookmarks`, `community_follows`, `community_reactions`.
- [ ] `GET https://api.chooseyour100.com/api/health` → `{"ok":true,...}`.
- [ ] Scheduler starts (`+10s`), no boot errors in the cPanel app log.
- [ ] A linked member's bot DM works (private), and a group message appears only in the
      community group.

### 6. Rollback (if anything is wrong)
- **Restore the backup**: cPanel Backups → Restore a MySQL Database Backup (or phpMyAdmin
  Import of the dump).
- Or reverse only the new migrations: `AUTO_MIGRATE` isn't a rollback tool — use the
  backed-up DB. The two bot migrations are reversible (`down()`), but a DB restore is
  the safe, complete rollback.
- Re-upload the previous app sources if the code was rolled back too.

## Data-loss rules
1. **Backup before any migration.**
2. **Never import `schema.sql` over an existing, non-empty prod DB.**
3. **Compare row counts before/after** — that is the data-loss proof.
4. Keep the dump / migration set in sync with the deployed code.

## Shared MySQL capacity (connection limit)
The host is a shared cPanel MySQL server (`max_connections≈150`, often near-full from
other tenants — `SHOW STATUS LIKE 'Threads_connected'`; observed at ~139/150). To stay a
light tenant and survive saturation:
- The app pool is now `min 0` / `max DB_POOL_MAX` (default **5**) with **3s** acquire/create
  timeouts, so it holds ≤5 connections and fails fast into the circuit breaker.
- **Circuit breaker** (`dbHealth`): on `ER_CON_COUNT_ERROR` (1040) the app sheds API
  requests with fast 503s for ~30s, stops logger retries, and skips the 1-minute
  broadcast poll — so it never amplifies a full server.
- Graceful shutdown on `SIGTERM`/`SIGINT` releases the pool on every restart.
- **Verify only ONE Node app instance** is running in cPanel (multiple instances would
  each open their own pool and double the scheduler/webhook load).

### Permanent fix (the real cause)
`Threads_connected ≈ 139/150` is mostly **other accounts sharing the same MySQL server**.
No app configuration can fully prevent 1040 while the host is oversubscribed. **Ask the
host to raise `max_connections`** (or move to a less-crowded/dedicated MySQL plan). Until
then, the app's behavior during a spike is: healthy 503s + an admin Telegram alert
(`🟠 ADMIN ALERT MySQL is saturated…`), then self-recovery in ~30s.