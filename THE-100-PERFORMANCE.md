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
    OR (TABLE_NAME='notifications' AND INDEX_NAME LIKE '%user_id_created_at%'));
```

## Future work (when scale demands)
- Redis-backed rate limiting + login lockout if the API runs more than one instance.
- Replace the community-feed aggregation with a precomputed/event-sourced feed.
- Offline PWA strategy for public pages only.