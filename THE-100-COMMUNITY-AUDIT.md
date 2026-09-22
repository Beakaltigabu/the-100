# THE 100 — Community Page Audit

**Audit only — no changes made.** This documents exactly how the Community page works
today, so we can decide what to keep, change, remove, or rebuild for the evolving
THE 100 brand/community strategy.

Audited: `client/src/pages/Community.jsx`, `client/src/components/FeedPost.jsx`,
`server/src/routes/community.js`, `server/src/services/streaks.js`, and the relevant
migrations/tables.

---

## 1. Locate the Community page

### Route & mounting
- **Path:** `/community` — defined in `client/src/App.jsx`, wrapped in `<ProtectedRoute>`
  (redirects to `/login` when unauthenticated). It sits under the global `Navigation`
  (top nav desktop / bottom nav mobile), `InstallBanner`, and `LanguageSync`.
- **Page component:** `client/src/pages/Community.jsx` (`Community`).
- **API mount:** `app.use('/api/community', communityRoutes)` in `server/src/app.js` →
  `server/src/routes/community.js`.

### Dependency map (actual)
```
CommunityPage (pages/Community.jsx)  [auth: ProtectedRoute]
├── api client (api/client.js — uses API_BASE)
│   ├── GET    /api/community/feed
│   ├── POST   /api/community/posts
│   ├── POST   /api/community/posts/:id/cheer
│   ├── DELETE /api/community/posts/:id
│   └── GET    /api/integrations/telegram/status
├── FeedPost (components/FeedPost.jsx)  ← feed item renderer
│   ├── initials()  (avatar from name)
│   └── timeAgo()   (lib/time.js, localized)
├── StatusBadge (components/StatusBadge.jsx)  ← Telegram status badge
├── Button (components/Button.jsx)
├── States (components/States.jsx)  ← LoadingState / ErrorState / EmptyState
├── useLanguage (context/LanguageContext.js)  ← EN/አማርኛ strings
└── useToast (components/Toast.jsx)

Server side:
routes/community.js  [router.use(requireAuth)]
├── GET    /feed            → joins users + enrollments + milestones + community_posts + post_cheers
├── GET    /stats           (exists, NO client caller)
├── POST   /posts           [postLimiter 5/min] → community_posts
├── POST   /posts/:id/cheer → post_cheers (toggle)
└── DELETE /posts/:id       → community_posts (owner or admin)
services/streaks.js  → computeStreaks() (used by /feed)
constants.js         → unitForActivity, UNIT_LABEL
DB (MySQL via Knex): users, enrollments, milestones, challenge_activities, community_posts, post_cheers
```

### State / real-time / styling
- **State:** local `useState` only (events, telegram, filter, draft, posting, loading, error). No Redux/Zustand/context for community.
- **Real-time:** none. Feed loads once on mount (`useEffect(load)`); the only refreshes are triggered by the user posting or deleting. No SSE, WebSocket, or polling.
- **Styling:** plain CSS files with design tokens (`var(--…` from `styles/tokens.css`), light/dark theme aware. Page CSS: `pages/Community.css`; item CSS: `components/FeedPost.css`.

---

## 2. Current user experience

1. **Loads first:** a full-page `LoadingState` spinner while `Promise.all([feed, telegramStatus])` resolves. If the feed request fails → `ErrorState` with Retry.
2. **Immediately visible (top → bottom):**
   - Header: kicker **THE 100**, title **Community**, subtitle *"The 100 community. Commit together."*
   - **Composer:** a 2-row `textarea` (max 500 chars) + **POST** button.
   - **Filter tabs:** All · Post · Join · Milestone · Finish (client-side filtering of the loaded events).
   - **Feed:** newest-first list of events (mixed types, see §3).
   - **Telegram card** (bottom): link status badge, "JOIN THE COMMUNITY" (deep-link button) and, when configured, a secondary "JOIN THE COMMUNITY GROUP" (invite link).
3. **Actions a user can take:**
   - Write + publish a text post (1–500 chars).
   - Filter the feed by type tab.
   - **Cheer** a post (toggle ✧/✦ — per-user, shows count).
   - **Share** a milestone (Web Share API or clipboard copy).
   - **Delete** their own post (with `window.confirm`).
   - Join the Telegram bot (`t.me/<bot>?start=<token>` deep link) and the community group invite link.
4. **What appears in the feed (5 kinds of event):**
   - `post` — member text: avatar (initials), name, relative time, body, cheer action (+ delete if own).
   - `milestone` — "{name} Hit {threshold} {unit} — THE 100 CLUB" + share.
   - `finish` — "{name} Finished their 100".
   - `join` — "{name} Joined THE 100".
   - `streak` — "{name} Checked in — {days}-day streak".
5. **How posts are created:** composer → `POST /api/community/posts {body}` → server inserts `community_posts` → client reloads the feed. Posting is rate-limited (5/min).
6. **How activities are represented:** **indirectly only.** There are no per-activity posts. Activities (manual or Strava) aggregate into `challenge_activities` → feed into `milestones` (thresholds), which surface as `milestone` events. Manual/Strava activity entries themselves never appear in the feed.
7. **Interacting with members:** cheer (like/unlike), share a milestone, and delete your own posts. **No** comments, replies, mentions, hashtags, follows, DMs, or profile links exist.
8. **No content:** `EmptyState` — *"Nothing yet — the movement starts with you."* (per filter tab too).
9. **New user:** sees the exact same global feed as everyone (not personalized). They can post/cheer immediately after registering. No onboarding nudge in the feed.
10. **Returning user:** same feed every visit. Own posts are flagged `isMine` (delete available); already-cheered posts show the filled mark. No unread indicators, no personalization, no live updates.

---

## 3. Community content model

| Content type | Status | Where / evidence |
|---|---|---|
| Text posts | **Fully implemented** | `community_posts` table; composer; `POST /posts`; shown in feed |
| Reactions (cheer) | **Fully implemented** | `post_cheers`; toggle `POST /posts/:id/cheer`; count + "me" state |
| Milestone posts | **Fully implemented (auto/derived)** | read-only events from `milestones` (reached_at), not editable |
| Finish events | **Fully implemented (derived)** | read-only events from `enrollments.status='completed'` |
| Join events | **Fully implemented (derived)** | read-only events from `enrollments.created_at` |
| Streak events | **Fully implemented (computed)** | `computeStreaks()` at request time |
| Pinned posts | **Referenced but unused (dead UI)** | `FeedPost` renders `feed-post--pinned` + "PINNED" when `item.isPinned`, but no endpoint ever sets `isPinned` |
| Community stats | **Implemented, unused** | `GET /api/community/stats` exists; no client calls it |
| Activity posts (per run/log) | **Not present** | activities never generate feed items |
| Strava activity posts | **Not present** | Strava imports aggregate to milestones only |
| Images / media | **Not present** | no upload, no image fields |
| Comments / replies | **Not present** | no tables or endpoints |
| Mentions / hashtags | **Not present** | body is plain text (React-rendered, no parsing) |
| User profiles (clickable) | **Not present** | name is a span; no `/profile/:id` link |
| Follows / friends | **Not present** | no tables |
| Challenges / events / announcements | **Not present** | challenge is global, not feed content |
| Bot / automated posts | **Not present in web feed** | Telegram broadcasts are separate (Telegram-side); they don't insert into `community_posts` |

---

## 4. Database / backend audit

Only tables involved in the Community experience.

### `community_posts`
```
id         bigint PK, auto-increment
user_id    bigint NOT NULL  → users.id (FK, ON DELETE CASCADE)
body       text NOT NULL    (1–500 chars enforced by zod)
created_at timestamp
indexes: created_at; user_id (FK)
```
- **Ownership:** `user_id`.
- **Engagement:** none stored — cheer counts are derived (`post_cheers`).
- **Moderation:** none (no flags/hidden columns). Deletion: owner or admin (`req.isAdmin`).

### `post_cheers`
```
id         bigint PK
post_id    bigint NOT NULL  → community_posts.id (FK, ON DELETE CASCADE)
user_id    bigint NOT NULL  → users.id (FK, ON DELETE CASCADE)
created_at timestamp
unique: (post_id, user_id)  ← a user cheers a post once (toggle)
```
- **Engagement:** 1 row per cheer; count via `COUNT(*)`, "did I cheer" via `user_id = me`.

### `milestones` (feed source for milestone events)
```
id           bigint PK
enrollment_id bigint NOT NULL → enrollments.id (FK, CASCADE)
threshold    decimal          → e.g. 10, 50, 100, 250, 500, 750, 1000 (per activity type)
reached_at   timestamp NULL   ← non-null = milestone event shown in feed
notified_at  timestamp NULL
unique: (enrollment_id, threshold); index: reached_at
```

### `enrollments` (feed source for join + finish events)
```
id, user_id (FK CASCADE), challenge_id (FK CASCADE), activity_type,
goal_value, start_date, end_date, status ('committed'|'active'|'completed'|'abandoned'),
completed_at, created_at
unique: (user_id, challenge_id); indexes: status, challenge_id
```
- `join` events use `created_at`; `finish` events require `status='completed'` + `completed_at`.

### `challenge_activities` (indirect — feeds milestones)
```
id, enrollment_id (FK CASCADE), date, quantity, activity_type,
source ('manual'|'strava'), strava_activity_id (unique), notes
indexes: (enrollment_id, date), date
```

### `users`
`id, name, email, …` — provides `name` (avatar initials, display) for feed events; `admins` table used only for delete authorization (`req.isAdmin`).

### Visibility / privacy
- **None at the post/event level.** Any authenticated member sees the entire feed. No private/DM content.
- **Deletion behavior:** FK `ON DELETE CASCADE` everywhere — deleting a user removes their posts + cheers; deleting a post removes its cheers.

---

## 5. Feed logic (`GET /api/community/feed`)

1. **Auth:** the whole router requires a valid session (`requireAuth`).
2. **Queries (all run per request):**
   - 25 latest `milestones` (reached_at non-null) joined to users.
   - 15 latest `finishes` (enrollments completed, `completed_at`).
   - 15 latest `joins` (enrollments `created_at`).
   - 30 latest `community_posts` joined to users.
   - Cheer rows for those post ids (counts + "cheered by me").
   - `computeStreaks()` → top streaks (date-bounded to the challenge window; ≥2-day streaks; capped internally).
3. **Merge & order:** each item becomes an `event` with a `kind` tag; all events are sorted **newest-first** by timestamp (`b.ts − a.ts`), then sliced to **60**.
4. **Personalization:** **none** — the same global feed for every user. Only two per-user derivations: `isMine` (for delete) and `cheered` (for the cheer mark).
5. **Pagination:** none — a single request capped at 60 events; older content is unreachable.
6. **Synthetic quirk:** `streak` events all get `ts = now` at request time, so they sort near the top on every load and can look repeated/duplicated.
7. **Real-time:** none (see §1).
8. **Rate limiting:** `POST /posts` → `postLimiter` (5/min). The cheer endpoint and `GET /feed` have **no specific limiter** (only the global `apiLimiter`); cheer is an unthrottled write toggle.

---

## 6. Observations for the decision (factual)

- The page is a **celebration feed**: system-derived events (join/finish/milestone/streak) + free-form member text posts with a single "cheer" reaction. It is not yet a general social layer (no comments, follows, media, profiles, activities-as-content, or live updates).
- **Dead / unused surface:** the "pinned" UI affordance (`isPinned` never set) and the `GET /api/community/stats` endpoint (no client caller).
- **Content is tightly coupled to the 100-day challenge model** (joins/finishes/milestones/streaks all derive from `enrollments`/`milestones`/`challenge_activities`), so expanding to non-100-day content (events, clubs, expeditions, stories, campaigns) would require new models/endpoints rather than extending the current feed.
- **No activity-level content:** a member's individual runs/logs/Strava activities don't appear; only aggregated milestones do.
- **Operational gaps:** no pagination (60-item cap, older content lost), no cheer rate limit, streak events injected with request-time timestamps.
- **Architecture is simple and replaceable:** one page component + one feed route + two tables. Rebuilding for a "movement" community layer would be low-risk to extract/replace.