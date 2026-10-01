# Manual Test Plan — Extensive Admin Panel Phase

Manual verification checklist for the admin engagement phase: session tracking,
PWA install detection, all-users members list + filters, member 360 detail,
internal notes, nudge, impersonation, analytics additions, the modern
two-column member detail redesign, the single-line broadcast banner, and the
notification center (Phase A).

## Setup

- Server running locally (`npm run dev` in `server/`), local MySQL up.
- Client running with `VITE_API_URL` pointing at the local server.
- One **admin** account + one **member** account.
- `TELEGRAM_DRY_RUN=true` so nudge DMs are logged, not sent.
- DB check command: `SELECT * FROM session_logs WHERE user_id=<id> ORDER BY last_heartbeat_at DESC;`

## A. Session tracking (time on platform)

| # | Steps | Expected |
|---|---|---|
| A1 | Sign in as member; keep app open ~70s | `session_logs` row exists with `session_id` = `sessionStorage('the100_session_id')`; `duration_seconds` grows each beat |
| A2 | Wait 2 min, don't touch | `duration_seconds` increases ~60s per minute |
| A3 | Reload page | Same session row continues (same `session_id`) |
| A4 | Open a 2nd tab | New row with a different `session_id` |
| A5 | Close tab >3 min, reopen | A new session row is created (gap-capped) |

## B. PWA install detection

| # | Steps | Expected |
|---|---|---|
| B1 | Install the PWA (browser install prompt) | `users.pwa_installed=1`, `installed_at` set; `GET /api/me` → `pwaInstalled: true` |
| B2 | As admin, open that member in list + detail | "Installed" badge shows; Strava/TG/Installed checkmarks |
| B3 | (Dev shortcut) POST `/api/session/installed` as member | Same effect without a real install |

## C. Members list — all users + filters

| # | Steps | Expected |
|---|---|---|
| C1 | Admin → Members | Lists **all** users incl. non-enrolled; columns Member / Goal / Progress / Day / Status / Strava / TG / Installed / Last seen / Time |
| C2 | Look at a non-enrolled user | Status `not_enrolled`, goal `—`, day `—` |
| C3 | Type in search box | Live filters by name/email |
| C4 | Toggle **Strava** filter | Only users with Strava connected |
| C5 | Toggle **Telegram** filter | Only users with active Telegram |
| C6 | Toggle **Installed** filter | Only PWA-installed users |
| C7 | Toggle **Active 7d** filter | Only users with an activity in the last 7 days |
| C8 | Combine 2+ filters | AND behavior |
| C9 | Banned user | Red `banned` badge |

## D. Member 360 detail

| # | Steps | Expected |
|---|---|---|
| D1 | Open member | Profile (email / joined / language / activity / experience / baseline) + status badges |
| D2 | Engagement panel | Last seen ≈ latest request; Requests 30d; Time on platform = sum of `session_logs`; Sessions count |
| D3 | Connections | Telegram state; Strava status + **connected / last-sync times**; PWA installed |
| D4 | Enrollment | Goal + window + recent activity rows |
| D5 | Admin history | Lists `view_member`, updates, etc. with time + admin name |

## E. Internal notes

| # | Steps | Expected |
|---|---|---|
| E1 | Save a note, reload | Note persists |
| E2 | Clear note, save | `notes` = null |

## F. Nudge

| # | Steps | Expected |
|---|---|---|
| F1 | Pick a preset → Send | Member gets in-app notification (type `nudge`); audit `member_nudge` logged |
| F2 | Custom message → Send | Member sees custom text |
| F3 | Member with Telegram linked | Receives "A nudge from the team" DM (test bot) |
| F4 | Empty message | Falls back to "Your 100 is waiting — check in today!" |

## G. Impersonation

| # | Steps | Expected |
|---|---|---|
| G1 | Member detail → "View as member" | Reloads to `/dashboard`; red banner "Viewing as {name} (impersonation — actions are logged)" |
| G2 | While viewing | `/api/me` returns the **member**; no admin nav; admin-only routes blocked |
| G3 | Audit | `impersonate_start` logged |
| G4 | "Exit view" | Clears token, reloads, back to admin identity |
| G5 | Impersonate a **banned** member | Rejected (409) |
| G6 | Expired token (>30 min) | Request 401 → treated as logged out |

## H. Analytics

| # | Steps | Expected |
|---|---|---|
| H1 | Stat cards | DAU / WAU / MAU, stickiness (≈ DAU ÷ MAU), total, installed, enrolled, completed, platform time + active users |
| H2 | Connections row | Strava / Telegram / Installed counts match DB |
| H3 | Install funnel | registered → installed → onboarded → enrolled → active → completed |
| H4 | Weekly retention | Cohort table with count + % per subsequent week |

## I. Regression / security

| # | Steps | Expected |
|---|---|---|
| I1 | Broadcast composer "individual" picker | Now includes **all users** (list is users-based) — verify no crash |
| I2 | Non-admin calls `/api/admin/*` | 401 |
| I3 | `/api/session/*` without login | 401 |
| I4 | Server tests | 88/88 pass |
| I5 | Client build | Clean |

## J. Notification center (Phase A)

| # | Steps | Expected |
|---|---|---|
| J1 | Log in as member | Bell icon in the top bar (next to language toggle); **red counter** equals the unread count (welcome/milestone/nudge/admin-message items) |
| J2 | Click the bell | Dropdown lists recent notifications newest-first with type / title / body / time; unread items highlighted with accent bar |
| J3 | Click an unread item | That item marks read; red counter decrements by 1 |
| J4 | Click **Mark all read** | Counter goes to 0; all items no longer highlighted |
| J5 | Click **View** | Navigates to `/notifications` full page with the same list + mark-all |
| J6 | Admin sends a **broadcast** (in-app) | **Does NOT** appear in the bell or `/notifications` (broadcasts are banner-only — see L); the single-line banner shows instead |
| J7 | Open `/notifications` while logged out | Redirected to login (route is protected) |
| J8 | `/api/notifications` without a session | 401 |
| J9 | Two members A and B | A only sees A's notifications; B's are never visible to A (no cross-user leak) |

### Preferences
| # | Steps | Expected |
|---|---|---|
| J10 | `/notifications` → toggle **Web: Announcements OFF** | New system announcements produce **no web notification row** (verify DB: no new `notifications` row for that member); Telegram still delivered if linked |
| J11 | Re-enable Web: Announcements | System announcements appear again |
| J12 | Toggle **Telegram: Milestones OFF** | Milestone **DM is not sent** (dry-run log shows no send); web milestone still appears |
| J13 | Verify prefs persist | Reload page — toggles stay in their saved state (`GET /api/notifications/preferences`) |

### Admin always-deliver (force)
| # | Steps | Expected |
|---|---|---|
| J14 | Member disables Web: Nudges and Web: Announcements | Admin **nudge** and admin **message** still arrive in the member's bell (ignore prefs) |
| J15 | Admin **nudge** with preset | Appears as a `nudge` notification ("A nudge from the team") + Telegram DM if linked; audit `member_nudge` logged |
| J16 | Admin **message** | Appears as an `announcement` notification; Telegram DM if linked; audit `member_message` logged |

### Unit tests
| # | Steps | Expected |
|---|---|---|
| J17 | `npm test` | `tests/notifications.test.js` — 4 tests pass (pref skip, absent=enabled, force bypass, telegramAllowed); full suite 88/88 |

### Preferences everywhere + list & mobile refinements
| # | Steps | Expected |
|---|---|---|
| J18 | Profile → **Notification preferences** | Compact **In-app** and **Push** master toggles with On/Off status; **"Manage notification preferences"** link navigates to `/notifications` |
| J19 | Profile → toggle **In-app OFF** | All web channels become disabled (verify on `/notifications` grid — every Web switch off); toggle back ON → all on |
| J20 | `/notifications` list with >8 items | Shows the **first 8**; **"View more"** reveals the rest; **"Show fewer"** collapses back |
| J21 | Resize to ≤600px and open the bell | Dropdown is a **centered floating panel** (fixed, centered, min(100vw-24px,360px)) — fully visible, no horizontal scroll |
| J22 | Resize to ≤420px and open `/notifications` preferences | Toggle grid fits (columns shrink to 52px) — no horizontal scroll, labels readable |

## K. Member detail — modern two-column redesign

| # | Steps | Expected |
|---|---|---|
| K1 | Admin → Members → click a row (or **View →**) | Opens member detail |
| K2 | Hero | Initials avatar, "Member #id" kicker, name, email + joined, status badges, primary actions (Send message / View as member) |
| K3 | Stat strip | 6 cards: Goal progress %, Day, This week, Active days, Next milestone, Platform time |
| K4 | Two-column layout (desktop) | Data cards on the left; **Manage panel stays sticky** while scrolling |
| K5 | Progress card | Progress bar fill + reached milestone pills (filled) + next milestone pill (outlined) |
| K6 | Manage panel → Send message | Focuses the message box; send → toast + notification row |
| K7 | Manage → Reset password (member w/o Telegram) | Reset link shown in panel; Copy works; expires in 15 min |
| K8 | Manage → Edit goal | Updates goal; Progress card reflects it |
| K9 | Manage → Mark complete / Re-open | Status + progress update |
| K10 | Manage → Disconnect Strava/Telegram | Confirm dialog; connection removed; Strava rows deleted |
| K11 | Manage → Danger zone (Ban / Delete) | Confirm dialog; destructive styling |
| K12 | Narrow the window to <980px | Single column; Manage panel is no longer sticky |

## L. Broadcast banner — single-line message

| # | Steps | Expected |
|---|---|---|
| L1 | Publish a live broadcast with in-app channel | Top banner renders as **one line**: `[TYPE] Title · body… [×]` |
| L2 | Long title/body | Single line truncates with ellipsis; full text shows on hover (`title`) |
| L3 | Type accent | Announcement orange; warning red; reminder blue (etc.) match the type |
| L4 | Dismiss (×) | Banner hides; stays hidden in that browser (localStorage) until a different broadcast |
| L5 | Narrow viewport (<480px) | Type label hides; message still one line |
| L6 | Admin composer "Live preview" | Matches the same single-line banner members see |
| L7 | Amharic user | Banner shows Amharic title/body when provided |

## M. Push notifications (Phase B)

Prereqs: run the site over **HTTPS or localhost** (secure context); server has VAPID keys (dev `.env` already set).

| # | Steps | Expected |
|---|---|---|
| M1 | Log in as member (not subscribed) | **"Enable notifications" banner** appears (per-session, if not subscribed & not denied) |
| M2 | Click **Enable** | Browser permission prompt → granting subscribes (POST `/api/push/subscribe`); row appears in `push_subscriptions`; toast "Notifications enabled"; banner disappears |
| M3 | Reload / new session | Banner does NOT reappear (already subscribed) |
| M4 | Click **Not now** | Banner hides for that session; reappears on the **next login session** |
| M5 | Deny permission in the browser | Banner no longer shows (permission `denied`) |
| M6 | Trigger a milestone (log activity crossing a threshold) | Push notification arrives on the device; tapping it opens the app |
| M7 | Admin sends a **nudge** or **message** | Push arrives even if the member disabled push for that type (force-delivered) |
| M8 | `/notifications` preferences → toggle **Push: Milestones OFF** | Next milestone produces no push (web still shows); re-enable → push returns |
| M9 | Verify subscription persists in DB | `SELECT endpoint FROM push_subscriptions WHERE user_id=<id>;` |
| M10 | (Unit) `npm test` | `tests/push.test.js` — 3 pass (sends to all subs, prunes 410, no-op when empty); full suite 88/88 |
| M11 | Client build | `dist/sw.js` generated (injectManifest) containing `push`/`showNotification`/`notificationclick` handlers; app still precaches + loads offline |
| M12 | `npm run dev` (hard refresh) | Dev service worker registers as a **module** worker (no "ServiceWorker script evaluation failed"); banner shows and Enable can subscribe on localhost |
| M13 | `/notifications` preferences → toggle **Push: All OFF** (or per type) | No push is sent for those types (web still works); re-enable → push returns |

## N. Admin system health & control (Phase E)

| # | Steps | Expected |
|---|---|---|
| N1 | Admin → Logs & System → **System** tab | "Run scheduled jobs" + "Flush logs" buttons appear above the stats |
| N2 | Click **Run scheduled jobs** | Toast "Scheduled jobs completed"; `event_logs` gains a `scheduler run` entry with duration; audit `scheduler_run` logged; (Strava safety-net sync also runs) |
| N3 | Click it again while a cycle is running | Toast "Scheduler already running" (`ran:false`) |
| N4 | Click **Flush logs** | Confirm dialog; confirming runs the prune → toast "Pruned {n} log rows"; audit `log_flush` logged |
| N5 | Flush twice in a day | First returns pruned count; second returns `removed:0` (retention already applied) |
| N6 | Non-admin calls `POST /api/admin/system/run-jobs` | 401 |
| N7 | `npm test` | Full suite still 88/88 |
| N8 | Client build | Clean |

## O. Admin list pagination, filters & date selectors

| # | Steps | Expected |
|---|---|---|
| O1 | Admin → Audit | Default **10 rows/page**; **Action** text filter + **From/To** date inputs; prev/next pager; **View more** appends the next 10 |
| O2 | Audit: enter a date range | List filters to that window (created_at); page resets to 1; total updates |
| O3 | Logs & System → Requests / Errors / Events | Default 10/page; **From/To** date selectors beside existing filters; View more grows the page |
| O4 | Logs: set From = today | Only today's entries show |
| O5 | Admin → Support | Default 10/page; From/To date range; status tabs still filter; View more appends |
| O6 | Admin → Members | Default 10/page (server-side); search + Strava/TG/Installed/Active filters + **Joined From/To** date; View more + pager |
| O7 | Members: filter Joined to a range | Only members who joined in that window appear |
| O8 | Admin → Broadcasts | Default 10/page; status tabs (All/Draft/Scheduled/Live/Ended/Archived) + **Created From/To**; View more + pager; archive/restore/publish/end still work |
| O9 | Broadcast composer edit fetch | Still loads the broadcast to edit (uses `limit=200`) |
| O10 | Non-admin calls any admin list | 401 |
| O11 | `npm test` | Full suite 88/88 |
| O12 | Client build | Clean |

## P. Dashboard redesign (Phase F)

| # | Steps | Expected |
|---|---|---|
| P1 | Log in with an active enrollment | Hero → **streak strip** → **"Today's move"** quick-log → progress ring → Why → sparkline → community pulse → milestone path → full log |
| P2 | Log activity today + yesterday | Streak strip shows **2** ("YOUR STREAK · Keep it alive") |
| P3 | With no activity today | Streak shows "Log today to start your streak." |
| P4 | "Today's move": type a value + **Log today** | Activity logged for today; ring/% and streak update; toast confirms; input clears |
| P5 | Quick presets (+1/+2/+5 km or +1/+2/+3 sessions) | Chip fills the input value |
| P6 | **More options →** | Scrolls to the full log form |
| P7 | Progress section | Ring shows total vs goal; **"X unit to your next milestone / to finish"** line under the % |
| P8 | Why card | Collapsible via the chevron; Edit still works |
| P9 | **LAST 7 DAYS** sparkline | Bars for each of the 7 days; today's bar reflects today's log |
| P10 | Community pulse | "N active this week · N in THE 100" shown |
| P11 | Milestone path + full log + Strava | Unchanged and still working |
| P12 | `/api/progress` response | Includes `streak` (number) and `weekSeries` (7 × {date,value}) |
| P13 | `npm test` | Full suite 88/88 |
| P14 | Client build | Clean |

## Q. Community rehaul (Phase G — pass 1)

| # | Steps | Expected |
|---|---|---|
| Q1 | Community page, right rail | **"OUR 100"** ring (community km vs combined goal, %) + **"This week's movers"** top-10 panel |
| Q2 | Click a movers row | Opens that member's profile modal |
| Q3 | Feed item (check-in / milestone / finish / join) | **Reaction bar** with 🔥 👏 💪 🏁 buttons + per-emoji counts |
| Q4 | Tap 🔥 | Toggles on (accent background, +1); tapping again removes it; other reactions unaffected |
| Q5 | React with two different emojis | Both appear; total increments |
| Q6 | Reaction counts in DB | `community_cheers` rows keyed by `item_key` + `reaction`; unique per (item, user, reaction) |
| Q7 | React then reload feed | `engagement = { reactions, total, myReactions }`; your reactions highlighted |
| Q8 | `/api/community/movers` | Top 10 by this week's logged quantity (name, total, unit) |
| Q9 | `/api/community/stats` | Includes `distanceMoved`, `distanceGoal`, `distancePct` |
| Q10 | Non-enrolled user posts | Feed scoping unchanged (challenge-scoped) |
| Q11 | `npm test` | Full suite 88/88 |
| Q12 | Client build | Clean |

## R. Community rehaul (Phase G — pass 2: comments, spotlight, prompts)

| # | Steps | Expected |
|---|---|---|
| R1 | Feed item → **💬** button | Toggles an inline comment thread; count shown on the button |
| R2 | Add a comment | Appears in the thread (author name + relative time); button count increments |
| R3 | Comment with empty body | Rejected (400) |
| R4 | Delete your own comment | Removed; count decrements |
| R5 | Someone else's comment | No delete option for you |
| R6 | Reload feed | Item `commentCount` reflects the total |
| R7 | Right rail → **Member spotlight** | Rotating member card (avatar, name, goal); click opens their profile |
| R8 | Feed top → **TODAY'S PROMPT** | Daily prompt card (changes daily, bilingual); composer still works below |
| R9 | `/api/community/spotlight` | Returns a member (or null) |
| R10 | `/api/community/prompt` | Returns a numeric `index` |
| R11 | `npm test` | Full suite 88/88 |
| R12 | Client build | Clean |

## S. Community rehaul (Phase G — pass 3: save + search)

| # | Steps | Expected |
|---|---|---|
| S1 | Feed item → **🔖** button | Toggles **saved** (accent highlight); tap again unsaves |
| S2 | Toolbar **Saved** chip | Filters the feed to only your saved items; toggle off restores all |
| S3 | Reload feed | Saved items keep `savedByMe` highlight |
| S4 | `/api/community/bookmarks` | Returns your saved item keys |
| S5 | Search box → type a member's name → **Search** | "Members" results appear; clicking a name opens their profile |
| S6 | Search a word in a check-in body | "Posts" results appear with author + text |
| S7 | Clear the search box | Results panel disappears |
| S8 | Empty query search | Returns no results (empty members/posts) |
| S9 | `npm test` | Full suite 88/88 |
| S10 | Client build | Clean |

## T. Community redesign — Pass 4 (streak, social proof, composer, follow)

| # | Steps | Expected |
|---|---|---|
| T1 | Community page top | **🔥 Day X / 100 · N-day streak · Keep it alive** (or "Log today to start your streak") |
| T2 | Below streak | **Live activity ticker** (last 5 check-ins: "Name +5 km · 2m"), refreshes ~60s |
| T3 | Composer | **Sticky** (stays while scrolling); **+1/+2/+5 km presets** pre-fill distance |
| T4 | Feed toolbar **Following** chip | Toggles to posts only from members you follow |
| T5 | Member profile modal → **Follow** | Follow/Unfollow toggles; self-follow rejected |
| T6 | `POST /api/community/follow/:id` | Returns `{ following }`; `GET /following` lists ids |
| T7 | `/api/community/feed?following=1` | Only followed members' posts; announcements excluded |
| T8 | `npm test` | 88/88 |

## U. Community redesign — Pass 5 (badges, challenges, leaderboard)

| # | Steps | Expected |
|---|---|---|
| U1 | Log your **first** activity | 🏃 **First Check-in** badge earned (shown in profile modal) |
| U2 | Reach a 7-day streak | 🔥 **7-Day Streak** badge |
| U3 | Hit a milestone / finish | 🎯 **First Milestone** / 🏁 **Finisher** badges |
| U4 | Profile modal | Shows earned badges strip |
| U5 | Right rail **Community challenge** | Active challenge card with progress bar + Join/Leave |
| U6 | Admin creates a challenge | `POST /api/community/challenges` (admin only); non-admin 403 |
| U7 | **Leaderboard** card | Top 10 (Week/All toggle) + "You are #rank this period" |
| U8 | `npm test` | 88/88 |

## V. Community redesign — Pass 6 (quest, recap, confetti, events, cross-post)

| # | Steps | Expected |
|---|---|---|
| V1 | **TODAY'S MISSION** card | Daily quest (changes daily, bilingual) |
| V2 | **THIS WEEK** card | Your check-ins / km / days / badges + community digest line |
| V3 | Hit a milestone as a member | **Confetti** celebration fires once (tracked, won't repeat) |
| V4 | **UPCOMING EVENTS** card | Events with RSVP toggle + link; admin creates via `POST /api/community/events` |
| V5 | Own check-in → **📣** button | Cross-posts to the Telegram group (dry-run in dev) |
| V6 | `npm test` | 88/88 |
| V7 | Client build | Clean |

## W. Community page redesign (editorial movement hub)

| # | Steps | Expected |
|---|---|---|
| W1 | Open Community (desktop) | Header: kicker "COMMUNITY" → **WE MOVE TOGETHER.** → tagline → **DAY X / 100 · N DAYS LEFT**; oversized decorative `100` art |
| W2 | Pulse row | **MEMBERS** / **MOVED TOGETHER** (km) / **MOVING THIS WEEK** — live values, thin dividers, no hierarchy/ranking language |
| W3 | 3-column hub | **Left:** Your 100 (activity, goal, total/goal, % bar, day, next milestone + km to go, **LOG ACTIVITY**) · **Center:** Today's Invitation + feed · **Right:** People Moving (non-ranked) + spotlight |
| W4 | **LOG ACTIVITY** (left) | Opens the **real activity logger** (POST `/api/activities/manual`); on submit the Your-100 bar/% updates |
| W5 | **TODAY'S INVITATION → CHECK IN** | Opens the social composer; posting adds to feed |
| W6 | Supporting sections below hub | **NEW THIS WEEK** (recent joins), **WHAT'S HAPPENING** (challenge + events), **Telegram bridge** |
| W7 | Feed | Center-focused, editorial items (milestone/finish/check-in/etc.), type filter intact; reactions/comments/save/cross-post work |
| W8 | **Dark theme** toggle | Near-black background, off-white text, orange accent — readable |
| W9 | **Light theme** toggle | Warm off-white background, near-black text, orange accent |
| W10 | Mobile (<720px) | Pulse stays **one 3-across row**; single column: header → pulse → Your 100 → feed → people → events → bridge; compact spacing |
| W11 | Right rail | **THIS WEEK leaderboard** (week/all) → People Moving (redesigned, non-ranked) → spotlight |
| W12 | Feed items | **Comments removed** — Cheer (reactions) only (💬 gone); reactions/comments… save/share/cross-post still work |
| W13 | `npm test` | 88/88 |
| W14 | Client build | Clean |