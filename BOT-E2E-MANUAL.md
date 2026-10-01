# THE 100 BOT — Manual E2E Runbook (real Telegram + real Website)

Final pre-deploy pass. Run against the **test bot** (@the100days_test_bot) and the **test community group**, with `TELEGRAM_DRY_RUN=false`. Keep the API running against the local DB and the website dev server open in a browser.

> Automated coverage: `npm run test:integration` (32 tests, real test DB, dry-run) — run it before this manual pass.

## 0. One-time setup (before any manual test)
- [ ] `setwebhook` re-run so `callback_query` is in `allowed_updates`:
      `npm run telegram:setwebhook` (uses `.env` bot token).
- [ ] Reset the group weekly budget so the cap is fresh:
      `DELETE FROM meta WHERE meta_key IN ('bot_group_count','bot_group_week');`
- [ ] Confirm `.env`: `TELEGRAM_GROUP_ID` = test group, `TELEGRAM_DRY_RUN=false`, VAPID + Strava keys set.
- [ ] Have a website account with a **500 KM RUNNING** challenge and another with a **250 KM** goal.

## 1. Bot — private companion (test in a private chat)
| # | Action | Expected |
|---|---|---|
| 1.1 | Website → JOIN THE COMMUNITY → deep link opens bot | `YOU'RE IN.` → `Your 100: RUN · 500 KM · 100 DAYS` |
| 1.2 | Tap SEE MY 100 | `ONE LAST THING.` → `[CONNECT STRAVA] [LOG MANUALLY]` |
| 1.3 | Tap LOG MANUALLY | `YOU'RE READY.` |
| 1.4 | Tap LOG ACTIVITY → RUN → 5 KM → TODAY → CONFIRM | `🟠 ACTIVITY LOGGED · 5 KM · 0 → 5 KM`; website dashboard shows 5 KM |
| 1.5 | Tap HOME | `DAY X / 100 · YOU'RE Y% IN · 5 / 500 KM` |
| 1.6 | Tap MY PROGRESS | goal, bar, %, remaining, next milestone |
| 1.7 | Tap MILESTONES | thresholds, current, next |
| 1.8 | Tap COMMUNITY | pulse (members / KM moved / moving-this-week) |
| 1.9 | ⚙️ MORE → PEOPLE LIKE YOU | same-goal peers, **not ranked** |
| 1.10 | ⚙️ MORE → STRAVA | connected → `Last synced:` / not connected → `CONNECT STRAVA` |
| 1.11 | ⚙️ MORE → NOTIFICATIONS | toggle MILESTONES off; set REMINDERS NEVER |
| 1.12 | `/start` again | welcome back → home (EN) |
| 1.13 | Unlinked user opens bot | "not linked" guidance |

## 2. Bot — private notifications
| # | Trigger | Expected |
|---|---|---|
| 2.1 | Log 125 KM via bot (cross first milestone) | `🟠 MILESTONE REACHED · 125 KM` + `[SHARE IT][VIEW PROGRESS]` |
| 2.2 | Same but MILESTONES=OFF | no milestone DM |
| 2.3 | Strava activity syncs | exactly **one** short `🟠 ACTIVITY LOGGED` DM (no duplicate) |
| 2.4 | DAY 10/50/75/90/99/100 | one `challenge-day` DM (skip if completed) |
| 2.5 | Monday | `🟠 YOUR WEEK` personal recap (skip if WEEKLY=OFF) |
| 2.6 | 7 days no activity | `YOUR 100 IS STILL HERE.` + `[LOG ACTIVITY]`; **no** 2nd within 7 days; skip if REMINDERS=NEVER |
| 2.7 | Reach 500 KM | `YOU DID THE 100.` + `[SHARE YOUR 100][WHAT'S NEXT?]`; website enrollment = completed |

## 3. Bot — community group (≤4/week)
| # | Action | Expected |
|---|---|---|
| 3.1 | First activity of any member | `🟠 FIRST STEP.` group post |
| 3.2 | Member crosses ≥100 KM milestone | `🟠 125 KM.`-style major-moment post |
| 3.3 | Member finishes | `🟠 WE HAVE A FINISHER.` post |
| 3.4 | Community total crosses 100/500/1K KM | `🟠 WE JUST PASSED X KM.` (once per threshold) |
| 3.5 | DAY 1/10/50/75/90/99/100 | community challenge moment (once/day) |
| 3.6 | Weekly | one rotating conversation starter |
| 3.7 | After 4 posts in a week | subsequent bot posts are **blocked** (cap) |
| 3.8 | Every bot group message | appears in the **community group only** — NEVER in an HQ channel |

## 4. Website ↔ bot seamless
| # | Action | Expected |
|---|---|---|
| 4.1 | Log on the **website** | dashboard updates + one milestone DM (if crossed) + curated group moment; **no** duplicate DM |
| 4.2 | Log via **bot** | website dashboard + feed reflect the same total |
| 4.3 | Bot `[SHARE IT]` | post appears on the **website community feed** |
| 4.4 | Bot settings OFF | website-triggered notifications suppressed for that category |
| 4.5 | Community page | member count / KM = same numbers the bot's pulse shows |

## 5. Admin → bot
| # | Action | Expected |
|---|---|---|
| 5.1 | Admin member → NUDGE | member gets a private bot DM + in-app notification |
| 5.2 | Admin System → Run Jobs | challenge-day / collective-distance / recap jobs fire through the real paths |

## 6. Confirmations for sign-off
- [ ] Every bot message is **English-only** (no Amharic duplication).
- [ ] **No** message ever appears in an HQ channel.
- [ ] No duplicate confirmations (bot log = 1, Strava sync = 1).
- [ ] All surfaces agree on totals / milestones / shares.