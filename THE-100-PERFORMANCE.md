# THE 100 — Performance

Audit results, the optimizations applied, the load-test baseline, and what to
re-run before launch.

---

## Optimizations applied (Sept 2026)

### Queries & indexes
- **New migration `20260917020000_perf_indexes.js`** — added indexes on the hot paths
  (all previously full table scans per EXPLAIN):
  - `telegram_connections(telegram_user_id)` — every bot message/DM lookup
  - `telegram_connections(link_token_hash)` — every `/start <token>` link
  - `strava_connections(strava_athlete_id)` — every Strava webhook event
  - `challenge_activities(date)` — daily digest
  - `milestones(reached_at)` — weekly digest
  - `enrollments(status)` — scheduler + community stats
  - `notifications(user_id, created_at)` — notification list ordering
- **EXPLAIN after**: all of the above moved from `type: ALL` (full scan) to
  `ref`/`range` with the expected key.

### N+1 query patterns removed
- **`GET /api/admin/members`** — was calling `enrollmentSummary` per member
  (~6 queries × N). Now 2 grouped queries (totals + last-date per enrollment)
  and computes day/status in memory.
- **Scheduler** (`checkFinishers`, `checkInactivity`, `checkWeekly`) — was running
  `totalForEnrollment` / last-activity / notification checks per enrollment.
  Now batched via `GROUP BY` and `WHERE user_id IN (...)`.
- **`computeStreaks`** (community feed + bot `/streaks`) — now bounded to
  `[challenge.start_date, today]` (a streak can never exceed the challenge length),
  instead of scanning every activity ever logged.

### Runtime
- **`getActiveChallenge`** is memoized in-process (60s TTL; bypassed under tests)
  instead of being queried 2–3× per request.
- **gzip compression** (`compression`, threshold 0) on all API JSON.
- **`Cache-Control: public, max-age=300`** on `/api/challenges/next`; `no-store` on `/api/health`.
- **Native `bcrypt`** replaces `bcryptjs` (~5–10× faster hashing; existing `$2a$`
  hashes still verify, new hashes are `$2b$`).

### Client
- **Route-level code splitting** (`React.lazy`) for Landing, ResetPassword, and all
  Admin pages. Main JS chunk ~272 KB (was ~283 KB); deferred chunks are < 4 KB each.

---

## Pre-deployment pass (Sept 21 2026)

### Queries & indexes
- **New migration `20260921000000_security_perf.js`**:
  - `community_posts(type, status, challenge_id, created_at)` composite — the feed
    check-in query went from full scan + filesort to an indexed range scan; the old
    single-column `created_at` index was dropped as redundant.
  - `enrollments(completed_at)` and `enrollments(created_at)` — feed finisher/join
    ordering no longer filesorts the whole table.
  - Dropped redundant `community_cheers(item_key)` (covered by the unique
    `(item_key, user_id)` leftmost prefix).
  - `users.token_version` (security — session invalidation).
- **`GET /api/community/people`** — was loading the full enrollment×user join plus
  two aggregate scans, then slicing 8–20 rows in JS. Now a single query with a
  grouped subquery (`SUM`/`MAX` per enrollment), `ORDER BY` + `LIMIT` in SQL.
- **Feed cheers** — was loading every cheer row for the page and matching in JS
  (O(items × cheers)). Now one `GROUP BY item_key` count query + one viewer-scoped
  lookup with `Set` membership.
- **`GET /api/admin/members`** — paginated (`page`/`limit`, default/max 500) with a
  `total` count; **`GET /api/notifications`** — bounded to the latest 50.
- **Scheduler** — per-member `users` lookups batched with `WHERE id IN (...)`;
  jobs isolated (one failure no longer aborts the cycle) and an overlap mutex
  prevents interleaved 6-hour cycles.
- **Finish detection race** — enrollment completion is now an atomic conditional
  `UPDATE ... WHERE status IN (...)`; only the winning caller announces the finish
  (no duplicate broadcasts when a manual log races the scheduler).
- **`getActiveChallenge`** memoized getter now used at every call site (was queried
  raw in ~6 places).

### Runtime
- **Job queue** — hard backlog cap (5,000) with drop-and-log; retries re-count
  against the backlog. Login-guard map capped (10k entries, expired-sweep + LRU).
- **DB pool** — explicit acquire/create/idle timeouts (10s/10s/30s); max size
  env-tunable via `DB_POOL_MAX`.
- **Admin stats** — 30s in-process cache (was 6 aggregate queries per dashboard load);
  **`/api/community/stats`** — `Cache-Control: private, max-age=30`.
- **Compression** — back to the 1 KB default threshold (was compressing every
  tiny JSON response).

### Static & client
- **Immutable caching** for Vite's content-hashed `/assets` — both in the Express
  static handler (same-origin deploys) and the Apache `.htaccess` (`Cache-Control:
  public, max-age=31536000, immutable`); `index.html`/`sw.js`/manifest are
  `no-cache` so deploys propagate instantly.
- **`.htaccess` security headers** — nosniff, frame-deny, Referrer-Policy,
  Permissions-Policy.
- **Full route-level code splitting** — every page except Login/Register is lazy.
  Main chunk **224 KB → 162 KB** (gzip 52 KB); admin chunks excluded from the PWA
  precache along with the 512 px icon (precache ~445 KB and capped at 300 KB/file).
- **Community refetch-on-focus** — gated by a 60 s staleness check (was firing the
  full 5-request fan-out on every alt-tab).

---

## Load-test baseline

Machine: local (Windows, Node 26, Laragon MySQL). 20 connections, 4s per endpoint,
**rate limiting disabled** (dev only — otherwise the limiter answers 429s).

```
/api/health                  611 req/s | p50  23ms  p90  63ms  p99 155ms | non-2xx 0
/api/challenges/next         454 req/s | p50  35ms  p90  78ms  p99 156ms | non-2xx 0
/api/me                      322 req/s | p50  60ms  p90  75ms  p99  96ms | non-2xx 0
/api/progress                242 req/s | p50  78ms  p90  99ms  p99 160ms | non-2xx 0
/api/community/feed           95 req/s | p50 169ms  p90 345ms  p99 426ms | non-2xx 0
```

**Notes**
- `/api/community/feed` is the heaviest endpoint (milestones + finishes + joins +
  posts + cheers + streaks). Fine at current scale; revisit if the community grows.
- Throughput here is bound by one MySQL instance and one Node process — expected.

---

## How to re-run

```bash
# terminal 1 — start the API with rate limiting off (dev only):
DISABLE_RATE_LIMIT=true npm run dev

# terminal 2 — benchmark:
npm run loadtest
# env: LOAD_URL (default http://localhost:4000), LOAD_DURATION (s), LOAD_CONNECTIONS
```

The script registers a throwaway `load_*@the100.app` user; delete it from your dev
DB when done.

## Index checklist (verify before launch)

```sql
-- every row below should return one index
SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA='the100'
  AND ((TABLE_NAME='telegram_connections' AND INDEX_NAME LIKE '%telegram_user_id%')
    OR (TABLE_NAME='telegram_connections' AND INDEX_NAME LIKE '%link_token_hash%')
    OR (TABLE_NAME='strava_connections'  AND INDEX_NAME LIKE '%strava_athlete_id%')
    OR (TABLE_NAME='challenge_activities' AND INDEX_NAME LIKE '%_date_index%')
    OR (TABLE_NAME='milestones'  AND INDEX_NAME LIKE '%reached_at%')
    OR (TABLE_NAME='enrollments' AND INDEX_NAME LIKE '%status%')
    OR (TABLE_NAME='enrollments' AND INDEX_NAME LIKE '%completed_at%')
    OR (TABLE_NAME='enrollments' AND INDEX_NAME LIKE '%created_at%')
    OR (TABLE_NAME='community_posts' AND INDEX_NAME='community_posts_feed_idx')
    OR (TABLE_NAME='notifications' AND INDEX_NAME LIKE '%user_id_created_at%'));
```

## Future work (when scale demands)
- Redis-backed rate limiting + login lockout if the API runs more than one instance.
- Replace the community-feed aggregation with a precomputed/event-sourced feed.
- Offline PWA strategy for public pages only.