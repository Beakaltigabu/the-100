# THE 100 — Community & Onboarding Redesign PRD

**Status:** Ready for implementation  
**Version:** 1.0  
**Scope:** Community experience + post-signup onboarding  
**Primary product:** THE 100  
**Audience:** Product/engineering/design agent implementing the existing application

---

## 1. Product Decision

### The problem

The current Community page is a simple celebration feed made from:

- member text posts
- milestone events
- finish events
- join events
- computed streak events
- one reaction type ("cheer")

The audit confirms that it is **not yet a general community layer** and is structurally tied to the current 100-day challenge model. It has no activity-level content, profiles, comments, media, events, challenge-aware content, pagination, personalization, or real-time updates.

The page also currently puts the Telegram entry point at the bottom, which makes the relationship between the website community and the Telegram community unclear.

The onboarding experience needs to do more than create an account. It needs to turn a new member from:

> "I signed up."

into:

> "I know what I'm doing, I've committed to it, and I know who I'm doing it with."

### The decision

**Do not turn the Community page into a generic social network.**

Instead, redesign it as **the community hub for the movement**:

> **Your challenge lives on the website.  
> The community makes it easier to keep going.**

The web community should focus on:

1. **Progress made visible**
2. **People made visible**
3. **Milestones and moments worth celebrating**
4. **A clear path into the wider community**
5. **A foundation that can support future challenges and events**

Telegram remains the high-conversation human space.

The website Community page should therefore **complement Telegram, not duplicate it**.

### Core experience principle

> **People should open Community and immediately feel: "There are real people doing this with me."**

---

# 2. Product & Brand Context

## Current product

THE 100 is a 100-day movement challenge.

Members choose:

- Running
- Walking
- Cycling
- Running + Walking

Then choose their own distance target.

Examples:

- 100 KM
- 250 KM
- 500 KM
- 1,000 KM
- Custom target

The challenge is the first expression of a broader movement.

Future possibilities include:

- additional challenges
- expeditions
- events
- meetups
- recurring movement experiences
- stories
- clubs
- community campaigns

Therefore, **do not hard-code the Community information architecture around one specific 100-day challenge concept.**

The UI can use THE 100 branding now, but the architecture must allow the content model to evolve.

---

# 3. Design Direction

## Brand personality

The Community experience must feel:

- direct
- confident
- human
- inclusive
- energetic
- grounded
- editorial
- movement-oriented

Avoid:

- generic fitness-app dashboards
- motivational quote walls
- excessive badges
- gamification for its own sake
- glossy "fitness influencer" visuals
- crowded social-network UI
- corporate community language

## Visual direction

Use the existing brand direction:

- `#0B0B0B` near-black
- `#F7F3ED` off-white
- `#FF6A2A` orange accent
- large typography
- strong numerals
- restrained cards
- generous negative space
- sharp hierarchy
- documentary / real-member feel
- orange primarily for calls to action, status, and emphasis

The page should feel closer to a **campaign/movement editorial experience** than a conventional social feed.

---

# 4. Target Community Mental Model

The old model is:

> COMMUNITY = POSTS

The new model is:

> COMMUNITY = PEOPLE + PROGRESS + MOMENTS + PARTICIPATION

This distinction should guide every design decision.

The community page is not trying to compete with Telegram, Instagram, Facebook, Discord, or a full social network.

It is the **shared surface of the challenge**.

---

# 5. New Community Information Architecture

## Primary route

`/community`

## Page structure

```text
COMMUNITY

[Header]
THE 100
We're doing this together.

[Community pulse]
Members      Distance moved      Challenges active
XXX          X,XXX KM            XX

[Your current challenge]
YOUR 100
500 KM
██████████░░░░ 62%
310 / 500 KM

[Primary CTA]
LOG AN ACTIVITY

[Community feed]
TODAY IN THE 100

[Feed item]
Member check-in / milestone / finish / official moment

[Feed item]
Activity achievement / milestone

[Feed item]
New member / commitment

[Community people]
PEOPLE MOVING NOW

member card   member card   member card

[Community bridge]
THE COMMUNITY CONTINUES ON TELEGRAM
Join the conversation → 

[Bottom]
Community guidelines / report / support
```

The exact visual layout can change responsively, but the information hierarchy should remain.

---

# 6. Community Header

Replace:

> "Community"

with a stronger movement-oriented expression.

### Desktop

Kicker:

> THE 100

Headline:

> **WE MOVE TOGETHER.**

Supporting text:

> Different goals. Different journeys. Same 100 days.

### Mobile

Use:

> **WE MOVE TOGETHER.**

with the supporting line below.

Do not make this a huge marketing hero that pushes content below the fold.

The first community content should remain visible quickly.

---

# 7. Community Pulse

Add a compact community summary near the top.

Show 3 metrics:

### MEMBERS
Number of active/committed members.

### DISTANCE MOVED
Total valid distance recorded during the active challenge/community period.

### MOVING NOW
Number of members with meaningful recent activity/check-in.

Do not present vanity statistics that are not reliable.

The server must calculate these from actual data.

The existing `/api/community/stats` endpoint may be reused if appropriate, but it must be audited and expanded rather than leaving an unused endpoint.

### Important

Statistics should reinforce:

> "I am part of something."

They should not create a leaderboard where members feel that the largest distance is the only thing that matters.

---

# 8. "Your Challenge" Context Card

The member should not have to leave Community to understand their own current participation.

Add a compact personal challenge card.

Example:

```text
YOUR 100

RUNNING
500 KM

62%
310 / 500 KM

DAY 47 / 100

[LOG ACTIVITY]
```

For another member:

```text
YOUR 100

WALKING
250 KM

38%
95 / 250 KM

DAY 32 / 100
```

This must use the member's active enrollment.

If the member has no active enrollment, show:

> **CHOOSE YOUR CHALLENGE**

with CTA:

> START YOUR 100

If the future product supports multiple concurrent challenges, this component should be built around an `active challenge/enrollment` concept, not hard-coded fields.

---

# 9. Community Feed — New Purpose

Rename the conceptual section from a generic "feed" to:

> **TODAY IN THE 100**

This is intentional.

We are not building an infinite content platform.

We are showing the moments that make the community feel alive.

## Content priority

The feed should contain meaningful community moments:

1. Member check-ins
2. Milestones
3. Finished challenges
4. New member commitments
5. Selected activity achievements
6. Official/community announcements
7. Community events
8. Member stories in the future

### Do NOT automatically create a post for every activity.

That would quickly produce noise.

A member who runs 7 km should not generate a new social post every time unless they choose to share it.

Instead:

- activities update progress
- meaningful milestones create community moments
- members can intentionally share a check-in
- important achievements can be surfaced automatically

---

# 10. Feed Item Types

Create a normalized community item API contract even if the underlying data still comes from multiple existing tables.

Recommended item types:

```text
check_in
milestone
finish
join
activity_highlight
announcement
event
story
```

The API should return a common structure:

```json
{
  "id": "stable-id",
  "type": "milestone",
  "createdAt": "...",
  "actor": {
    "id": "...",
    "name": "...",
    "avatarUrl": "...",
    "activityType": "running"
  },
  "challenge": {
    "id": "...",
    "name": "THE 100"
  },
  "data": {},
  "engagement": {
    "cheers": 12,
    "cheeredByMe": false
  }
}
```

This should be a presentation contract, not a requirement that every item be stored in one database table.

---

# 11. Feed Item Designs

## A. Member Check-in

Example:

```text
BEAKAL
Day 18

"Legs were heavy today, but I got it done."

7.2 KM
RUNNING

♡ 12 cheers
```

A check-in is intentionally lightweight.

### Requirements

- text: 1–500 characters
- optional distance
- optional activity
- optional photo in a future phase
- timestamp
- actor identity
- active challenge context when available

The creation UI should make sharing easy without forcing a long social-post workflow.

---

## B. Milestone

Example:

```text
25% COMPLETE

ABEBA REACHED
125 KM

WALKING

THE 100
```

Action:

> CHEER

Optional action:

> SHARE

Do not make every milestone look identical. 100% completion should have stronger visual emphasis.

---

## C. Finish

Example:

```text
FINISHED

MERON FINISHED
HER 100

500 KM · 100 DAYS

CHEER
```

The finish event is a major community ritual.

---

## D. New Member

Example:

```text
WELCOME

DANIEL JUST STARTED
THE 100

CYCLING · 250 KM

CHEER
```

New-member moments should help existing members recognize and welcome newcomers.

This supports a sense of belonging without needing a follow/friend system.

---

## E. Activity Highlight

Only create this for events that are meaningful enough to be community content.

Examples:

- first activity
- longest activity
- new personal distance record where the product can reliably determine it
- comeback after inactivity, if deliberately surfaced
- challenge-specific achievements

Avoid turning the feed into a stream of raw Strava imports.

---

## F. Announcement

Official content must be visually distinguishable from member content.

Example:

```text
THE 100 HQ

SATURDAY GROUP RUN
OCT 17 · ADDIS ABABA

[VIEW EVENT]
```

Official posts may be pinned.

The current code has a dead "pinned" UI surface. Implement pinning only as part of this actual announcement model; do not retain decorative dead logic.

---

# 12. Feed Interaction Model

## Keep

### Cheer

Keep the current "cheer" interaction.

It is simple and appropriate for the product.

The interaction should feel like encouragement, not competition.

### Share

Keep sharing for:

- milestones
- completion
- selected achievements

### Delete

Members can delete their own check-ins.

## Do not add in this release

Do not introduce:

- follows
- friend requests
- direct messages
- comment threads
- reposts
- quote posts
- hashtags
- algorithmic ranking
- follower counts

These would turn a focused community layer into a generic social network and are not necessary to achieve the product goal.

---

# 13. Feed Ordering

The feed should be **meaningful + recent**, not purely chronological.

Use a deterministic ranking approach.

Priority:

1. Official urgent/event content
2. Important member milestones
3. Finishes
4. Fresh member commitments
5. Member check-ins
6. Lower-priority activity highlights

Within each category, sort newest-first.

Avoid opaque engagement algorithms at this stage.

### Why

The goal is not "maximize scrolling."

The goal is:

> help members see enough real community activity to feel connected and continue participating.

---

# 14. Feed Pagination

The audit identifies the current 60-item hard cap and no pagination.

Replace it with cursor pagination.

Initial load:

- 15–20 items

Next page:

- 15–20 items

Use a stable cursor based on:

- timestamp
- unique item identifier

Do not use offset pagination for the main feed.

Display:

> LOAD MORE

on desktop if appropriate.

On mobile, infinite scroll can be used, but it must still be cursor-based.

---

# 15. Real-Time Updates

Do not introduce WebSockets as a requirement for this release.

Add a lightweight refresh strategy:

- refresh after creating a post
- refresh after joining/changing challenge
- refresh when returning to the Community route
- optionally poll while the page is active at a conservative interval if needed

Do not create unnecessary background traffic.

WebSockets/SSE can be considered later when community volume justifies it.

---

# 16. "People Moving Now"

The Community page should include people as first-class community objects.

Add:

> **PEOPLE MOVING NOW**

Show a small horizontal/stacked list of members with:

- name
- avatar/initials
- activity
- challenge distance
- recent progress/status

Example:

```text
PEOPLE MOVING NOW

[Avatar] Hana
Running · 500 KM
62% complete

[Avatar] Yared
Walking · 250 KM
38% complete

[Avatar] Sam
Cycling · 1,000 KM
21% complete
```

Use recent activity rather than a raw alphabetical directory.

### Important

This is NOT a leaderboard.

Do not sort by total distance.

Sort by meaningful recent participation.

---

# 17. Member Profiles

The current audit confirms there are no clickable profiles.

Add a lightweight profile surface.

For this release, profiles need only contain:

- display name
- avatar/initials
- selected activity
- current challenge
- challenge progress
- completed challenge history if available
- public community check-ins

Do not build a full social graph.

Route:

`/members/:id`

or equivalent.

A profile should answer:

> "Who is this person and what are they doing here?"

---

# 18. Telegram Relationship

The current page contains Telegram links at the bottom with bot/group status.

Redesign this into a deliberate bridge.

### Section:

> **THE CONVERSATION CONTINUES ON TELEGRAM.**

Supporting:

> Share the daily ups and downs. Find people to move with. Keep each other going.

Primary CTA:

> JOIN THE COMMUNITY

Secondary CTA when bot onboarding is available:

> CONNECT THE 100 BOT

### Placement

Place this after the member/feed content, not buried at the absolute bottom of the page.

For a member who has not joined Telegram, show a subtle persistent prompt.

For someone already connected:

> YOU'RE IN THE COMMUNITY

with access to the group.

### Principle

Website:

> "What am I doing?"

Telegram:

> "Who am I doing it with?"

Bot:

> "What's happening?"

Do not duplicate Telegram conversations into the web feed.

---

# 19. Empty State

The current empty state is:

> "Nothing yet — the movement starts with you."

Keep the spirit, but make it actionable.

### Global empty state

```text
THE MOVEMENT STARTS HERE.

Nobody has posted yet.

Start the first moment.

[POST A CHECK-IN]
```

### New member empty state

If the member has just joined:

```text
YOU'RE HERE.

Now make it real.

Choose your challenge,
then take the first step.

[START YOUR 100]
```

Do not make new members feel as though they entered an abandoned platform.

---

# 20. Community Composer Redesign

The current large textarea should not dominate the page.

Change it to a compact action card:

```text
HOW'S YOUR 100 GOING?

[ Share a check-in... ]

[CHECK IN]
```

On click, open/expand a composer.

Fields:

- optional text
- optional linked activity
- optional "share this activity" toggle if an activity exists

Suggested quick prompts:

- "What did you get done today?"
- "How are you feeling?"
- "What are you committing to this week?"

Do not force prompts every time.

---

# 21. New Onboarding Philosophy

The onboarding goal is not:

> collect as much information as possible.

The goal is:

> get the member committed and connected with minimal friction.

Community onboarding research consistently points toward a clear value proposition, a small number of high-impact first actions, and an early meaningful contribution rather than overwhelming new members with setup tasks.

The onboarding should therefore optimize for:

**Clarity → Commitment → First action → Community**

---

# 22. New Onboarding Flow

## Step 0 — Account

Keep registration as lightweight as possible.

Required:

- name/display name
- email
- password/authentication method

Avoid asking for unnecessary profile data.

After account creation:

> **YOU'RE IN.**

Then immediately start challenge setup.

---

# 23. Step 1 — Choose Your Activity

Screen:

> **HOW DO YOU WANT TO MOVE?**

Options:

```text
RUN
WALK
CYCLE
RUN + WALK
```

Each option gets one concise explanatory line if needed.

Do not show a large catalog.

Selection is required.

CTA:

> CONTINUE

---

# 24. Step 2 — Choose Your Distance

Screen:

> **WHAT'S YOUR 100?**

Supporting copy:

> Choose a distance you can commit to for 100 days.

Preset cards:

```text
100 KM
250 KM
500 KM
1,000 KM
CUSTOM
```

When custom is selected:

- numeric input
- activity-appropriate unit

Show a lightweight reality cue:

```text
500 KM
≈ 5 KM/day
```

This is an informational estimate, not a recommendation.

Avoid telling the member what target they "should" choose.

CTA:

> COMMIT TO MY 100

---

# 25. Step 3 — Start

The member sees a confirmation screen:

```text
THIS IS YOUR 100.

RUNNING
500 KM
100 DAYS

STARTS TODAY

[START MY 100]
```

This is the commitment moment.

The enrollment should be created here.

Do not create the enrollment earlier and then leave the user stuck in onboarding.

---

# 26. Step 4 — Activity Tracking Choice

After enrollment:

> **HOW WILL YOU TRACK IT?**

Options:

### CONNECT STRAVA
Recommended when available.

### LOG IT MANUALLY
No integration required.

### I'LL DO THIS LATER
Continue without tracking setup.

This is important.

Do not make Strava a blocker to participation.

A member should never feel:

> "I can't start because I don't use Strava."

---

# 27. Step 5 — Community Connection

Next:

> **YOU DON'T HAVE TO DO THIS ALONE.**

Explain the two spaces:

### WEBSITE
Track progress, milestones, challenge.

### TELEGRAM
Talk, share, find people, stay connected.

Primary CTA:

> JOIN THE COMMUNITY

Secondary:

> I'LL JOIN LATER

Do not force Telegram.

The user's challenge must remain fully usable without it.

---

# 28. Step 6 — First Community Action

After Telegram choice, the user should be asked for one small public action.

Screen:

> **MAKE YOUR FIRST MOVE.**

Prefill a check-in:

```text
I'm doing 500 KM in 100 days.

Let's go.
```

Allow editing.

CTA:

> SHARE MY COMMITMENT

Secondary:

> SKIP FOR NOW

Publishing this creates a `check_in` item.

This should be the first intentional community contribution.

---

# 29. Onboarding Completion

After the first action:

```text
YOU STARTED.

500 KM.
100 DAYS.
ONE COMMUNITY.

DAY 1 STARTS NOW.

[SEE MY 100]
[GO TO COMMUNITY]
```

Primary CTA should go to the member's challenge/dashboard.

Secondary CTA goes to Community.

The member should understand exactly what happens next.

---

# 30. Returning User Onboarding

Never show the full onboarding again.

Use an `onboarding_status` or equivalent progress state.

Recommended states:

```text
account_created
challenge_selected
enrollment_created
tracking_configured
telegram_prompted
first_checkin_prompted
completed
```

A user can skip optional steps without being treated as incomplete forever.

For example:

- Strava skipped → onboarding can still be complete
- Telegram skipped → onboarding can still be complete
- first check-in skipped → community can continue to nudge gently

---

# 31. Post-Onboarding Activation Checklist

On the user's Community or Dashboard, show a small optional checklist only until activated:

```text
GET STARTED

✓ Choose your 100
✓ Start your challenge
○ Track your first activity
○ Join the community
○ Share your first check-in
```

Once the member has completed the key activation actions, hide the checklist.

Do not make a permanent task list.

---

# 32. Onboarding Rules

### Rule 1 — Never block on integrations

Strava and Telegram are optional.

### Rule 2 — One decision per screen

Do not combine activity + distance + Telegram + Strava into one giant form.

### Rule 3 — Show consequence before commitment

When choosing a distance, immediately show what that commitment means in plain terms.

### Rule 4 — Preserve agency

The member chooses their challenge.

Do not push everyone toward a certain goal.

### Rule 5 — Get to value quickly

A member should reach their challenge dashboard within minutes.

### Rule 6 — Create one social connection early

The first check-in is the preferred social activation event.

### Rule 7 — Do not overwhelm

Only collect information that affects the experience.

---

# 33. Onboarding UX States

Implement explicit states for:

- loading
- validation errors
- duplicate/invalid enrollment
- Strava OAuth success
- Strava OAuth failure
- Telegram deep-link unavailable
- Telegram already connected
- first check-in successful
- skipped steps
- network error
- session expiry

Every state needs a useful recovery action.

Avoid dead-end error messages.

---

# 34. New Navigation Logic

Community should be easy to reach but should not compete with the member's main challenge.

Recommended primary navigation:

```text
MY 100
COMMUNITY
```

On mobile:

```text
Home / My 100
Community
Profile / More
```

Use the existing navigation system where possible.

Do not introduce a large number of navigation destinations in this release.

---

# 35. Data Model / Backend Direction

The audit shows the current community system is tightly coupled to:

- `enrollments`
- `milestones`
- `challenge_activities`
- `community_posts`
- `post_cheers`

Do not throw away the existing models unnecessarily.

Instead introduce a **community presentation layer** that can normalize different sources into community items.

## Recommended conceptual model

```text
Challenge
  ↓
Enrollment
  ↓
Activities / milestones
  ↓
Community item

User
  ↓
Check-in
  ↓
Community item

Official content
  ↓
Announcement / event
  ↓
Community item
```

This allows future content without forcing everything into `community_posts`.

---

# 36. Schema Changes

Exact migration strategy is implementation-dependent, but the following capabilities are required.

## `community_posts`

Extend to support, where appropriate:

```text
id
user_id
challenge_id nullable
enrollment_id nullable
body
item_type/check_in type
created_at
updated_at
visibility
status
```

Do not break existing data.

Existing text posts should migrate conceptually to:

```text
type = check_in
```

or an equivalent compatible type.

---

# 37. Reactions

Keep:

`post_cheers`

but structure the API so future reaction types could be added without rewriting the feed contract.

For now the only supported reaction is:

> CHEER

---

# 38. Announcements / Events

Create separate first-class models for official content rather than abusing member posts.

Conceptually:

```text
community_announcements
community_events
```

Each should have:

- id
- title
- body
- cover/media reference when supported
- created_at
- published_at
- status
- pinned_at
- optional challenge_id
- optional event date/location

This is intentionally future-ready for expansion beyond the current challenge.

---

# 39. Feed API

The frontend should consume a unified endpoint such as:

```text
GET /api/community/feed
```

Recommended query parameters:

```text
cursor
limit
type
challengeId
```

Response:

```json
{
  "items": [],
  "nextCursor": "..."
}
```

Do not return separate top-level lists for every feed type.

The server should own ordering and filtering.

---

# 40. Community Stats API

The current audit shows `/api/community/stats` exists but is unused.

Either:

1. wire it properly into the new Community page, or
2. remove it if its responsibilities are better merged into another API.

Do not retain dead endpoints.

Stats should be derived from authoritative data.

---

# 41. People API

Add a lightweight endpoint for:

```text
GET /api/community/people
```

Parameters can include:

```text
limit
activityType
challengeId
```

The first release can simply return recently active members.

No follow system is required.

---

# 42. Activity Sharing

The audit confirms that raw manual/Strava activities currently never appear in Community.

Add a deliberate sharing mechanism.

A member can choose:

> SHARE TO COMMUNITY

when viewing an activity.

That creates a community `activity_highlight`.

Default should be:

> private to my progress

unless explicitly shared.

This prevents feed spam and preserves member control.

---

# 43. Milestone Generation

Continue deriving milestones from progress.

Improve the current milestone model so the system can support future challenge definitions rather than assuming a hard-coded 100-day challenge.

A milestone should conceptually belong to:

```text
challenge
+
enrollment
+
threshold
```

Future challenges can define different thresholds.

---

# 44. Streaks

The audit identifies a bug where streak events receive the current request timestamp, causing them to appear near the top and potentially look duplicated.

Fix this.

The event timestamp must represent when the streak milestone actually occurred.

Also:

- do not produce a streak event for every request
- persist or deterministically derive the actual event date
- deduplicate the event

Only surface meaningful streak moments.

---

# 45. Moderation

The current community system has no moderation model.

For this release, add minimum viable controls:

### Member

- delete own check-in
- report content

### Admin

- hide/remove content
- review reports
- pin official content

Do not build a complex moderation suite.

A simple moderation status is enough:

```text
published
hidden
removed
```

---

# 46. Rate Limiting

The current audit identifies that posting is rate-limited but cheer toggles are not specifically limited.

Add appropriate rate limits to:

- feed mutations
- check-in creation
- cheer toggle
- report submission

The exact limits should be conservative and configurable.

---

# 47. Security

Every write operation must verify:

- authenticated user
- ownership where applicable
- challenge/enrollment relationship where applicable
- input length/type
- authorization for admin actions

Do not trust frontend-provided ownership fields.

---

# 48. Responsive Design

## Mobile priority

The mobile experience should be the reference.

Mobile hierarchy:

```text
WE MOVE TOGETHER.

Community pulse

Your challenge

Today in the 100

Feed

People moving now

Telegram
```

Keep cards compact.

Do not create horizontally overflowing tables.

## Desktop

Use a centered content column with optional side context.

Potential:

```text
LEFT / MAIN
Community feed

RIGHT / CONTEXT
Your challenge
Community pulse
Telegram
```

Do not force a desktop-specific architecture if it increases implementation complexity unnecessarily.

---

# 49. Loading States

Use skeletons rather than a single full-page spinner once the shell is known.

The page should render:

- header immediately
- skeleton for stats
- skeleton for challenge card
- skeleton for feed
- skeleton for people

This makes Community feel fast even if some endpoints are slower.

---

# 50. Error Handling

If feed fails:

Do not replace the whole page with a generic error.

Show:

```text
THE FEED DIDN'T LOAD.

[TRY AGAIN]
```

Keep:

- navigation
- challenge card where possible
- other independent content

Use independent requests when practical.

---

# 51. Analytics

Instrument the new experience.

## Onboarding events

```text
signup_started
signup_completed
activity_selected
distance_selected
challenge_committed
tracking_choice_selected
strava_connected
tracking_skipped
telegram_join_clicked
telegram_skipped
first_checkin_started
first_checkin_created
onboarding_completed
```

## Community events

```text
community_viewed
community_feed_loaded
community_feed_next_page
checkin_composer_opened
checkin_created
cheer_added
cheer_removed
milestone_shared
activity_shared
member_profile_opened
telegram_community_clicked
```

Do not track unnecessary personal content.

---

# 52. Success Metrics

The main success metric for the redesign is **community activation**, not page views.

## Primary

### 7-day Community Activation Rate

Percentage of new members who, within 7 days:

- complete their challenge setup
- record at least one activity
- perform one community action OR join Telegram

Track the components separately as well.

## Secondary

- onboarding completion
- first activity within 24 hours
- first check-in rate
- Telegram join rate
- Community return rate in 7 days
- weekly active community members
- meaningful feed interactions per active member
- percentage of members reaching first milestone
- percentage of finishers who return to community

Avoid optimizing for raw number of posts.

More posts is not necessarily better.

---

# 53. Acceptance Criteria — Onboarding

## Required

- [ ] A new member can complete signup and challenge setup without Strava.
- [ ] Activity selection exists.
- [ ] Distance selection exists.
- [ ] Custom distance works.
- [ ] Member sees a clear commitment confirmation before enrollment.
- [ ] Enrollment is created exactly once.
- [ ] Strava can be connected but is optional.
- [ ] Manual logging can be selected.
- [ ] Telegram can be joined but is optional.
- [ ] Member can create a first commitment/check-in.
- [ ] Onboarding state persists.
- [ ] Reloading cannot accidentally restart enrollment.
- [ ] Errors have recovery actions.
- [ ] Onboarding works on mobile.

---

# 54. Acceptance Criteria — Community

## Required

- [ ] `/community` remains protected.
- [ ] Page displays community pulse.
- [ ] Page displays active member's current challenge.
- [ ] Feed displays normalized community items.
- [ ] Feed is server-ordered.
- [ ] Feed is cursor-paginated.
- [ ] Member check-ins are supported.
- [ ] Milestones remain supported.
- [ ] Finish events remain supported.
- [ ] Join events remain supported.
- [ ] Streak behavior is corrected.
- [ ] Activity sharing is explicit rather than automatic.
- [ ] Official content is visually distinct.
- [ ] Cheer remains functional.
- [ ] Member profiles are discoverable.
- [ ] People moving now is shown.
- [ ] Telegram bridge is clear.
- [ ] Empty states are actionable.
- [ ] Loading states are graceful.
- [ ] Feed failure does not destroy the whole page.
- [ ] Mobile layout is fully usable.
- [ ] Existing community data remains intact.

---

# 55. Acceptance Criteria — Future Readiness

The implementation must not assume:

- only one challenge
- only one activity type
- only one content source
- only one community event type
- only one lifetime enrollment per member
- every activity becomes a feed post

A future challenge should be able to contribute community moments without requiring the entire Community page to be rewritten.

Example future:

```text
THE 100
100-day distance challenge

THE CROSSING
265 KM expedition

THE 30
30-day movement challenge
```

The Community layer should be capable of showing all three through the same feed contract.

---

# 56. What NOT To Build

This release must not turn into a social-network rewrite.

Do not build:

- DMs
- follower system
- friend requests
- comments
- nested replies
- stories/reels
- public follower counts
- complex recommendation algorithms
- full media gallery
- public leaderboards
- achievement badge collection systems
- chat inside the website
- duplicate Telegram functionality

Those can be reconsidered only after the community behavior has been validated.

---

# 57. Implementation Strategy

## Phase 1 — Data/API foundation

1. Define normalized community item DTO.
2. Update feed endpoint.
3. Add cursor pagination.
4. Add stats endpoint usage.
5. Add people endpoint.
6. Add moderation/status support.
7. Fix streak timestamps.
8. Add challenge-aware fields where required.
9. Preserve existing data.

## Phase 2 — Onboarding

1. Implement the new onboarding state machine.
2. Connect challenge creation to commitment step.
3. Add tracking choice.
4. Add Telegram bridge.
5. Add first check-in.
6. Add activation checklist.
7. Add analytics.

## Phase 3 — Community UI

1. New page shell.
2. Community pulse.
3. Your challenge card.
4. Feed redesign.
5. Composer.
6. People moving now.
7. Member profile surface.
8. Telegram bridge.
9. Responsive states.

## Phase 4 — QA and migration

1. Existing post compatibility.
2. Existing milestone compatibility.
3. Existing cheer compatibility.
4. Existing Telegram states.
5. Mobile QA.
6. Empty/error/loading QA.
7. Analytics QA.
8. Security/authorization QA.

---

# 58. Design QA Checklist

Before considering the work complete, manually verify:

### Brand

- [ ] Does it feel like THE 100?
- [ ] Is orange used as an accent rather than decoration?
- [ ] Is the page visually confident without becoming aggressive?
- [ ] Does it feel like a movement rather than a fitness dashboard?

### Community

- [ ] Can a new member immediately understand what this space is for?
- [ ] Can they see real people?
- [ ] Can they see progress?
- [ ] Can they see meaningful community moments?
- [ ] Is Telegram clearly complementary?

### Onboarding

- [ ] Is each step obvious?
- [ ] Is there unnecessary information collection?
- [ ] Can someone start without Strava?
- [ ] Can someone start without Telegram?
- [ ] Does the flow create an early commitment?
- [ ] Does the user know what to do next?

### Future

- [ ] Could another challenge appear here without redesigning the whole system?
- [ ] Could an event appear without pretending to be a member post?
- [ ] Could member stories be added later?
- [ ] Can the product grow beyond the current 100-day challenge?

---

# 59. Final Product Principle

The Community redesign should not try to make the website addictive.

It should make participation feel **shared**.

The core emotional sequence is:

```text
I joined.
↓
I chose something.
↓
I'm making progress.
↓
Other people are doing this too.
↓
Someone noticed.
↓
I kept going.
↓
I finished.
↓
There's something next.
```

That is the community loop.

THE 100 should feel less like:

> "Here is a feed."

and more like:

> **"Look around. You're not doing this alone."**

---

## 60. Source Audit Reference

This PRD is based on the existing Community audit. The audit documents the current `/community` route, its frontend/server dependencies, current feed types, the absence of activity-level feed content, lack of pagination/real-time updates, current Telegram placement, and the fact that the existing implementation is tightly coupled to the 100-day challenge model. See the audit's dependency map and current-experience sections for the concrete implementation baseline.

Reference: `THE-100-COMMUNITY-AUDIT.md`.
