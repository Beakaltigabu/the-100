# THE 100 — Community, Bot & Telegram Audit

Comprehensive audit of the existing Community experience, THE 100 BOT, and their
integration with Telegram. This document records the **current implementation**
and a **proposed redesign** — no code has been changed as part of this audit.

---

## 1. Current Community Implementation Audit

| Feature | Status | Current implementation |
|---|---|---|
| Text posts | ✅ Fully implemented | `community_posts` (type `check_in`, optional `body`); ComposerCard → `POST /api/community/posts` |
| Cheers | ✅ Fully implemented (upgraded) | `community_cheers` with **reactions** 🔥👏💪🏁 (multi-reaction, per-user/per-item/reaction) |
| Milestones | ✅ Fully implemented | Feed items derived from `milestones` (reached_at); milestone cards in feed |
| Activity feed | ✅ Fully implemented | Tiered, cursor-paginated feed (`communityFeed.buildFeed`): check_in / milestone / finish / join / announcement |
| Member profiles | ✅ Fully implemented | `/api/community/members/:id` + MemberProfileModal (+ badges, follow, check-ins, completed) |
| Community statistics | ✅ Fully implemented | `/stats` (members, distanceMoved, distanceGoal, distancePct, activeWeek) + CommunityPulse + "Our 100" ring |
| Telegram integration | ✅ Fully implemented | TelegramBridge card; connect deep-link; group link; cross-post check-ins to group |
| Comments | ✅ Fully implemented | `community_comments` (list / add / delete) on feed items |
| Media | ❌ Not implemented | Deliberately excluded by earlier decision (no photo/media check-ins) |
| Events | ✅ Fully implemented | `events` + RSVP (`event_participants`) + admin create |
| Announcements | ✅ Fully implemented | `community_announcements`, pinned support, HQ feed cards |
| Personalization | ⚠️ Partially / over-built | Search + Saved/bookmarks + **Follow/Following** built (⚠️ conflicts with new direction — see §5) |
| Pagination | ✅ Fully implemented | Cursor pagination on feed; server paging on admin lists |
| Real-time updates | ❌ Not implemented | 60s polls (social-proof ticker, pulse cache 30s); no WebSockets (spec: don't build) |

### Current user journey (when someone opens Community)

1. Hero: "THE 100 / COMMUNITY — WE MOVE TOGETHER."
2. Streak strip (your streak, loss aversion).
3. Live "people moving" ticker (last 5 check-ins, 60s refresh).
4. Daily quest + daily prompt.
5. Sticky composer with quick-log presets.
6. Toolbar: type filter (all/check_in/milestone/finish/join/announcement), Following chip, Saved chip, search.
7. Tiered feed (announcements → milestones → finishes → joins → check-ins), cursor-paginated.
8. Right rail: Our-100 ring, community challenge, weekly recap, leaderboard, movers, spotlight, events, Telegram bridge.
9. Member profile modal on click (follow, badges, check-ins).

### Key finding — activity vs social separation

Community **check-ins are social content** (a `community_posts` row with optional
distance) and do **not** write to `challenge_activities`. Progress and milestones
use `challenge_activities` as the single source of truth. This separation is
already correct per the product spec.

---

## 2. Current Bot Implementation Audit

- **Entry point:** `routes/webhooks/telegram.js` (Express webhook, HMAC-verified, retrying FIFO queue).
- **Library:** none — raw `fetch` to the Telegram Bot API.
- **Sends:** `services/telegramMessenger.js` (HTML parse mode, retries, `TELEGRAM_DRY_RUN`).
- **Messages:** `services/botMessages.js` (bilingual EN/አማርኛ).

| Bot capability | Status | Current implementation |
|---|---|---|
| Start/onboarding | ✅ Implemented | `/start <token>` links account; bare `/start` → welcome-back / not-linked |
| Account linking | ✅ Implemented | App generates deep link `t.me/<bot>?start=<token>` (15-min token); `telegram_connections` state `active` |
| My progress | ✅ Implemented | `/status` (goal, total, day, %), `/day`, `/goal` |
| Milestones | ⚠️ Partial | Milestone/finish DMs fire, but no dedicated milestones view and no 25/50/75/100% celebration |
| Activity logging | ✅ Implemented | `/checkin <n>` → `logActivity` (today) |
| Strava integration | ⚠️ Indirect | `/status` reflects Strava-synced totals; the bot cannot trigger a sync |
| Manual activity | ✅ Implemented | `/checkin` |
| Reminders | ❌ Not implemented | `users.preferred_time` + `schedule_days` exist but are **unused**; only inactivity/weekly DMs |
| Milestone notifications | ✅ Implemented | DM on milestone + group broadcast |
| Completion notification | ✅ Implemented | DM + group broadcast on finish |
| Community link | ❌ Not implemented | No bot → community navigation |
| Website link | ⚠️ Partial | `/start` / help text references the app URL |
| Telegram group link | ✅ Implemented | JOIN button + welcome includes group invite |

### Relationship (single source of truth)

```
USER
  → WEBSITE ACCOUNT (users)
  → ENROLLMENT (enrollments)
  → ACTIVITIES (challenge_activities)
  → PROGRESS (totalForEnrollment)
  → MILESTONES (milestones)
  → TELEGRAM ACCOUNT (telegram_connections, via telegram_user_id)
  → BOT (webhooks/telegram)
```

**Gap:** the bot has no `callback_query` / inline buttons, no `bot_state`, no
guided check-in, and no reminder scheduler (Phase D was placed on hold).

---

## 3. Current Website ↔ Bot ↔ Telegram Integration Audit

- **Linking:** app `GET /api/integrations/telegram/connect` → deep link → bot `/start` burns token → `telegram_connections` state `active`.
- **Activity flow:** manual / Strava / Telegram → `challenge_activities` → shared `totalForEnrollment` → `emitProgressEvents` (milestones + finish) → notifications (web/push) + bot DM + group broadcast. Community feed derives milestone/finish/join from the same tables. **No duplication — one source of truth already.**
- **Community content:** created via `/api/community/posts`; announcements via admin; events/challenges separate tables.
- **Bot → community events:** bot `/checkin` creates `challenge_activities` (→ feed milestones), but there is **no "share to community" affordance** — the bot cannot intentionally publish a milestone/finish post.
- **Website → bot notifications:** admin nudge/message force-deliver via bot; broadcast DMs + group.
- **Duplicate logic:** none significant — progress/milestones are shared. The mismatches are product-level (bot lacks buttons/reminders/share) and over-built social (follow/leaderboard), not data duplication.

---

## 4. What Should Be Kept

- Single source of truth: `challenge_activities` → progress → milestones → events → notifications.
- Feed types + tiered cursor pagination + per-type visual weight.
- Reactions (cheers), comments, bookmarks, search.
- Streak strip, social-proof ticker, daily quest, daily prompt.
- Events + RSVP, community challenges (collective goals), announcements + pin.
- Our-100 ring, CommunityPulse, member profiles + badges, spotlight.
- Telegram bridge + cross-post; bot linking flow; bot `/status /day /goal /checkin /streaks`.
- Notifications/preferences, broadcasts, admin panel, dashboard (Phase F).

---

## 5. What Should Be Removed (per the new product direction)

- **Follow / Following system** (`community_follows`, Following chip, profile Follow button) — the spec explicitly prohibits followers/following.
- **Public ranked Leaderboard** (week/all, "your rank") — the spec says "Do not rank members by distance" and "Do NOT make this a leaderboard."
- **WeeklyMovers ranked top-10** → reframe as non-ranked "who moved this week."
- **"Your rank" / hierarchy messaging** anywhere.
- (Nothing else is redundant; media/stories were never built.)

---

## 6. What Should Be Redesigned

- **Community page IA** (see §7, §12, §13) — editorial, not card-soup.
- **Feed item visuals** — differentiated editorial weight per type (milestone = oversized numeral, finish = full-bleed, check-in = restrained), not identical cards.
- **People Moving** — non-ranked discovery.
- **Bot experience** (resurrect + redesign Phase D): TRACK / REMIND / CELEBRATE / CONNECT with inline buttons, guided check-in, % milestones, reminders, intentional share-to-community.
- **Bot connection status** surfaced on the website (Community right rail + My 100).
- **Visual identity** pass toward near-black / off-white / orange editorial.

---

## 7. Community Information Architecture (proposed)

```
COMMUNITY HEADER — "WE MOVE TOGETHER." / tagline
COMMUNITY PULSE — members · distance moved · active (+ Our 100 ring)
3-COLUMN HUB
  LEFT  YOUR 100    — activity · goal · progress · day · next milestone · [LOG ACTIVITY]
  CENTER TODAY IN THE 100 — composer · editorial feed
         (check_in / activity_highlight / milestone / finish / join / story / announcement / event)
  RIGHT PEOPLE MOVING (non-ranked) · WHAT'S HAPPENING (events) · TELEGRAM / BOT status · community context
```

Answers: *What's happening? What are others doing? What can I participate in now?*
Activity data and social content stay separate.

---

## 8. Bot Information Architecture (proposed)

- **Onboarding:** "YOU'RE IN. 🟠" with their activity/goal/100 days; recognizes the existing account (already does).
- **Navigation buttons:** 📊 MY PROGRESS · 🏁 MY MILESTONES · 👥 COMMUNITY · 🌐 WEBSITE · ➕ LOG ACTIVITY · ⚙️ SETTINGS (callback queries).
- **TRACK:** progress card (activity, goal, total, %, day, remaining to next milestone).
- **REMIND:** event-driven + configurable daily/weekly reminder using existing `preferred_time` / `schedule_days`; inactivity nudge. No spam.
- **CELEBRATE:** 25 / 50 / 75 / 100% + major milestones, each with `[SHARE TO COMMUNITY]` (intentional, not auto).
- **CONNECT:** buttons back to community / group / website.

---

## 9. Website ↔ Bot Interaction Flows

- **Website → Bot:** (a) connect card → deep link; (b) connection status (`GET /api/integrations/telegram/status` already exists); (c) admin nudge/message → DM (exists).
- **Bot → Website:** buttons open `clientOrigin` routes (`/dashboard`, `/community`, `/profile`); linking state reflected on the website.
- **Event flow (shared):** member moves → activity logged → progress updated → meaningful event? → YES → bot personal celebration + community event (optional share). No duplicates.

---

## 10. Telegram ↔ Community Interaction Flows

- **Telegram Community group** = conversation (human). **HQ** = announcements. **Bot** = personal. Do not duplicate across surfaces.
- **Group → Community:** cross-post check-ins (exists) stays opt-in; bot group broadcasts (milestone/finish/digest) stay on meaningful events only.
- **Community → Telegram:** the TelegramBridge card ("the conversation continues") points to the group; bot status card points to the bot.

---

## 11. Data / API Changes Required

- **Remove:** `community_follows` table + follow/following/`feed?following` endpoints + Following chip + leaderboard endpoint + ranked `WeeklyMovers` + "your rank".
- **Add:** `bot_state` table (per-user flow state) for guided check-in; `callback_query` support in the Telegram webhook + `setWebhook allowed_updates`; keyboard builders; reminder scheduler using `users.preferred_time` / `schedule_days`; milestone % (25/50/75/100) event emission; `POST /api/community/share` for intentional bot→community milestone/finish posts; a website bot-connection status card.
- **Keep unchanged:** `challenge_activities`, progress/milestone logic, notifications, auth, linking, feed/service tables.

---

## 12. Desktop UI Structure (proposed)

Full-width editorial header → pulse row → **3-column hub**:

- **LEFT** — Your 100 (activity, goal, progress, day, next milestone) + Log activity.
- **CENTER** — Today in THE 100 (composer + editorial feed: milestones, activity highlights, stories, check-ins, announcements).
- **RIGHT** — People Moving (non-ranked), Upcoming events, Telegram / Bot status, community context.

Structure via typography, thin dividers, whitespace — minimal card chrome. Oversized numerals for milestones, restrained orange.

---

## 13. Mobile UI Structure (proposed)

Recompose single column (do not simply shrink desktop):

1. Community identity
2. Community pulse
3. Your 100
4. Today's feed
5. People Moving
6. Events
7. Telegram / Bot

Primary actions (composer / log) obvious.

---

## 14. Component Architecture

Reuse existing components:

- `FeedItem` (redesign variants), `CommunityPulse`, `ComposerCard`, `MemberProfileModal`,
  `WeeklyRecap`, `EventCard`, `CommunityChallenge`, `StreakStrip`, `SocialProofBand`,
  `TelegramBridge`, `DailyQuest`, `DailyPrompt`, `SpotlightCard`, `CircularProgress`.

Add:

- `BotConnectCard` (website bot connection/status).
- Bot-side: `BotKeyboard` builders + `BotShareButton`.
- `PeopleMoving` (non-ranked; replaces Leaderboard + ranked movers).

---

## 15. Implementation Phases

1. **Audit cleanup** — remove follow/leaderboard/ranked movers; reframe People Moving (non-ranked).
2. **Community IA + UI** — restructure page to §12/§13; editorial feed variants; visual identity pass.
3. **Bot redesign (Phase D resume)** — `bot_state`, callback buttons, guided check-in, reminders, % milestones, share-to-community.
4. **Integration flows** — bot status card on website; event-driven notification tuning; verify no duplicate records.
5. **Testing + deploy.**

---

## 16. Testing Plan

**Community** — new member; member with no activity; member with activity; member with milestones; nearing completion; completed; empty feed; multiple feed types; cheer; posting; deleting own post; community statistics; mobile; desktop.

**Bot** — new bot user; existing account linking; connected account; unconnected account; progress display; milestone notification; completion notification; community link; website link; Telegram group link; invalid/expired linking token; duplicate account linking; notification failure.

**Integration** — `ACTIVITY LOGGED → PROGRESS UPDATED → MILESTONE UPDATED → COMMUNITY EVENT (where appropriate) → BOT NOTIFICATION (where appropriate)`, verifying no duplicate or conflicting records. Plus a regression pass on the existing test suite and client build.

---

## Product Principles

- **MY 100** → my journey.
- **COMMUNITY** → our journey.
- **THE 100 BOT** → my companion.
- **TELEGRAM COMMUNITY** → our conversation.
- **THE 100 | HQ** → official communication.

Goal: move from "a page where community posts appear" to "the digital home of
the people doing THE 100 together" — not a generic social network.