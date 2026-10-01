# THE 100 BOT — Test Matrix

Status of the personal-companion bot (Phases 1–5). All checks pass locally in
**dry-run mode** (`TELEGRAM_DRY_RUN=true`). Group posts are capped at **≤4/week**
and the bot **never** posts to any chat other than the community group
(`config.telegram.groupId`) or a linked member's private chat (HQ guard).

## 1. Language / personality
| Check | Expected | Status |
|---|---|---|
| All bot messages English-only | No Amharic duplication in bot UX | ✅ |
| Voice = short/bold/direct | No corporate/AI/generic phrasing | ✅ |
| No shame/guilt language | Re-engagement avoids "missed"/"behind" | ✅ (test) |

## 2. Home screen
| Check | Expected | Status |
|---|---|---|
| Active home | DAY X, %, activity, total/goal, next-milestone distance | ✅ (dry-run) |
| Not-started home | `YOUR 100 IS READY.` + `DAY 1 STARTS WITH YOU.` | ✅ |
| Completed home | `YOU DID THE 100.` + SHARE / WHAT'S NEXT | ✅ (dry-run) |
| 5 primary buttons | PROGRESS / LOG / MILESTONES / COMMUNITY / MORE | ✅ |

## 3. Navigation & commands
| Check | Expected | Status |
|---|---|---|
| Buttons primary | callback_query router for every screen | ✅ |
| Commands secondary | `/start /progress /log /milestones /community /settings /help` | ✅ |
| Unlinked guard | callback → "not linked yet" | ✅ |
| Mid-flow text input | custom distance / date via `bot_state.expect` | ✅ |

## 4. My Progress
| Check | Expected | Status |
|---|---|---|
| Progress card | goal, ring-bar, total/%, remaining, next milestone + to-go | ✅ (dry-run) |
| Dashboard link | `[VIEW FULL DASHBOARD]` → client `/dashboard` | ✅ |

## 5. Activity logging
| Check | Expected | Status |
|---|---|---|
| Type → distance → date → confirm | button flow; respects configured activity | ✅ |
| Custom distance/date | text input, validated (positive KM / YYYY-MM-DD) | ✅ |
| No duplicates / validation | reuses `logActivity`; out-of-window rejected | ✅ |
| Confirmation | before→after total, %, next milestone | ✅ (dry-run) |

## 6. Strava
| Check | Expected | Status |
|---|---|---|
| Connected state | "syncing automatically" + last-synced date | ✅ (dry-run) |
| Not connected | CONNECT STRAVA deep link to `/profile?strava=connect` | ✅ |
| Manual logging unaffected | always available | ✅ |

## 7. Milestones
| Check | Expected | Status |
|---|---|---|
| Goal-adaptive list | thresholds from the member's milestone table | ✅ |
| Reached ✓ / next ○ | current + next + remaining | ✅ (dry-run) |

## 8. Private notifications (6 categories)
| Check | Expected | Status |
|---|---|---|
| Activity confirmation (Strava) | short DM; no duplicate for bot-logged | ✅ (test) |
| Milestone celebration | EN + `[SHARE IT][VIEW PROGRESS]`; gated by milestonesOn | ✅ (smoke) |
| Challenge-day moments | DAY 1/10/25/50/75/90/99/100; once/day; skip completed; gated | ✅ (smoke) |
| Weekly recap | EN; Mondays; gated by weeklyOn | ✅ |
| Re-engagement | ≥5–7d inactive, ≥7d cooldown; reminders ≠ never; EN + `[LOG ACTIVITY]` | ✅ |
| Completion | EN card + `[SHARE YOUR 100][WHAT'S NEXT?]` | ✅ |

## 9. Settings
| Check | Expected | Status |
|---|---|---|
| Toggles | milestones / weekly / community ON-OFF | ✅ (dry-run) |
| Reminders | never / occasionally / regularly; default occasionally | ✅ (test) |

## 10. Group catalyst (≤4/week)
| Check | Expected | Status |
|---|---|---|
| Conversation starters | ~1/week, rotating prompts | ✅ (smoke) |
| Collective distance | 100/500/1K/2.5K/5K/10K, once each | ✅ (smoke) |
| Member moments | first step / major milestone (≥100 KM) / finish | ✅ (smoke) |
| Group challenge moments | DAY 1/10/50/75/90/99/100, once/day | ✅ (smoke) |
| New-member welcome | short EN, guard-capped | ✅ |
| Weekly cap | guard blocks beyond 4/week | ✅ (verified) |
| No daily digest / per-activity | removed | ✅ |

## 11. No HQ posting
| Check | Expected | Status |
|---|---|---|
| Architectural guard | all group posts → `config.telegram.groupId` only | ✅ |
| No HQ id in bot code | reserved config slot, never referenced | ✅ |

## 12. Community pulse / People like me
| Check | Expected | Status |
|---|---|---|
| Community pulse (private) | members / moved / moving-this-week + OPEN COMMUNITY | ✅ |
| People like you | same activity+goal, alphabetical, never ranked | ✅ (smoke + test) |

## 13. Onboarding & deep linking
| Check | Expected | Status |
|---|---|---|
| Deep-link connect | `/start?token` → YOU'RE IN → SEE MY 100 → tracking choice → READY | ✅ (dry-run) |
| Welcome back | bare `/start` linked → EN home | ✅ (test) |
| No second registration | website remains source of truth | ✅ |

## 14. Share
| Check | Expected | Status |
|---|---|---|
| `[SHARE IT]` | preview card → creates website community post | ✅ (smoke) |
| Completion share | `I DID MY 100. 🧡` card on the feed | ✅ (smoke) |
| Confirmation | "Shared to your 100." + home | ✅ |

## Server suite
`npm test` → **104/104** (11 files, incl. `botMessagesV2.test.js` 10 tests).