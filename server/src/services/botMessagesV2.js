// THE 100 BOT — English-only personal messages. Short. Bold. Direct.

const bar = (pct) => {
  const filled = Math.max(0, Math.min(10, Math.round((pct || 0) / 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
};

// ── Home ─────────────────────────────────────────────
const homeActive = ({ activity, goal, total, unit, pct, day, next, remainingToNext, remaining }) => {
  const left = remaining !== undefined ? remaining : remainingToNext;
  const lines = [
    'THE 100 🟠',
    '',
    `DAY ${day} / 100`,
    `YOU'RE ${pct}% IN.`,
    '',
    activity.toUpperCase(),
    `${total} / ${goal} ${unit}`,
    '',
    next && left !== undefined ? `${left} ${unit} TO YOUR NEXT MILESTONE.` : 'Keep going.'
  ];
  return lines.join('\n');
};

const homeNotStarted = ({ activity, goal, unit }) =>
  [
    'THE 100 🟠',
    '',
    'YOUR 100 IS READY.',
    '',
    activity.toUpperCase(),
    `${goal} ${unit}`,
    '',
    'DAY 1 STARTS WITH YOU.'
  ].join('\n');

const homeComplete = ({ goal, unit }) =>
  ['THE 100 🟠', '', 'YOU DID THE 100.', '', `${goal} ${unit}`, '100 DAYS'].join('\n');

// ── Progress ─────────────────────────────────────────
const progressMsg = ({ activity, goal, total, unit, pct, day, remainingToGoal, next, remainingToNext }) =>
  [
    '📊 YOUR PROGRESS',
    '',
    `THE 100 · DAY ${day} / 100`,
    '',
    activity.toUpperCase(),
    `${goal} ${unit} GOAL`,
    '',
    `${total} ${unit}`,
    bar(pct),
    `${pct}%`,
    '',
    `${remainingToGoal} ${unit} REMAINING`,
    '',
    'NEXT MILESTONE',
    next ? `${next} ${unit}` : '—',
    next ? `${remainingToNext} ${unit} TO GO` : '',
    '',
    'Keep going.'
  ].join('\n');

// ── Logging ──────────────────────────────────────────
const logAskType = () => ['What did you do?', '', 'Choose an activity below.'].join('\n');
const logAskDistance = () => ['HOW FAR?', '', 'Pick a distance or enter your own.'].join('\n');
const logAskDate = () => ['WHEN?', '', 'Today, yesterday, or pick a date.'].join('\n');

const logConfirm = ({ activity, distance, unit, when, from, to, pct, next, remainingToNext }) =>
  [
    '🟠 ACTIVITY LOGGED',
    '',
    `${activity.toUpperCase()}`,
    `${distance} ${unit}`,
    when.toUpperCase(),
    '',
    'YOUR PROGRESS',
    `${from} → ${to} ${unit}`,
    `${pct}% COMPLETE`,
    '',
    next ? `Next milestone:\n${next} ${unit}` : '',
    next ? `${remainingToNext} ${unit} to go.` : ''
  ].join('\n');

// ── Milestones ───────────────────────────────────────
const milestonesMsg = ({ rows, current, next, remainingToNext }) =>
  [
    '🏁 YOUR MILESTONES',
    '',
    ...rows.map((r) => (r.reached ? `${r.threshold} ${r.unit}      ✓` : `${r.threshold} ${r.unit}      ○`)),
    '',
    `CURRENT ${current} ${rows[0] ? rows[0].unit : ''}`,
    next ? `NEXT ${next} ${rows[0] ? rows[0].unit : ''}` : 'DONE',
    next ? `${remainingToNext} ${rows[0] ? rows[0].unit : ''} TO GO.` : ''
  ].join('\n');

const milestoneHit = ({ threshold, unit, goal, pct }) =>
  ['🟠 MILESTONE REACHED', '', `${threshold} ${unit}.`, '', `You just crossed ${pct}% of your ${goal} ${unit} goal.`].join('\n');

// ── Completion ───────────────────────────────────────
const completion = ({ goal, unit }) =>
  ['🟠 YOU DID THE 100.', '', `${goal} ${unit}.`, '100 DAYS.', '', 'You started.', 'You showed up.', 'You finished.'].join('\n');

// ── Notifications ────────────────────────────────────
const activityConfirmed = ({ distance, unit, total, goal, pct, next, remainingToNext }) =>
  [
    '🟠 ACTIVITY LOGGED',
    `${distance} ${unit} added.`,
    '',
    `${total} / ${goal} ${unit}`,
    `${pct}% complete.`,
    '',
    next ? `Next milestone: ${next} ${unit}.` : '',
    next ? `${remainingToNext} ${unit} to go.` : '',
    '',
    'Keep it short.'
  ].join('\n');

const challengeDay = (day) => {
  const msgs = {
    1: ['DAY 1', '', 'You started.'],
    10: ['10 DAYS IN.', '', 'The idea is becoming a habit.'],
    25: ['25 DAYS.', '', 'A quarter of the way.'],
    50: ['HALFWAY.', '', '50 days behind you.', '50 ahead.'],
    75: ['75 DAYS.', '', 'In the final stretch.'],
    90: ['10 DAYS LEFT.'],
    99: ['TOMORROW.', '', '100 days.', 'Finish what you started.'],
    100: ['YOU DID THE 100.']
  };
  return (msgs[day] || []).join('\n');
};

const weeklyRecap = ({ week, weekKm, unit, activities, total, goal, pct, next, remainingToNext }) =>
  [
    '🟠 YOUR WEEK',
    '',
    `THE 100 · WEEK ${week}`,
    '',
    `${weekKm} ${unit}`,
    'THIS WEEK',
    '',
    `${activities} ACTIVITIES`,
    '',
    `${total} / ${goal} ${unit}`,
    'TOTAL',
    `${pct}% COMPLETE`,
    '',
    next ? `NEXT MILESTONE ${next} ${unit}` : '',
    next ? `${remainingToNext} ${unit} TO GO.` : '',
    '',
    'Another week done.'
  ].join('\n');

const reengage = () =>
  ['YOUR 100 IS STILL HERE.', '', 'You don\'t need to catch up.', 'Just start again.'].join('\n');

// ── Community ────────────────────────────────────────
const communityPulse = ({ members, moved, unit, movingWeek }) =>
  [
    'THE COMMUNITY TODAY',
    '',
    `${members} members`,
    `${moved} ${unit} moved`,
    `${movingWeek} people moved this week.`,
    '',
    "You're part of it."
  ].join('\n');

// ── Settings ─────────────────────────────────────────
const settingsMsg = (s) =>
  [
    '🔔 NOTIFICATIONS',
    '',
    `MILESTONES   ${s.milestonesOn ? 'ON' : 'OFF'}`,
    `WEEKLY RECAP ${s.weeklyOn ? 'ON' : 'OFF'}`,
    `COMMUNITY    ${s.communityOn ? 'ON' : 'OFF'}`,
    `REMINDERS    ${s.remindersMode.toUpperCase()}`
  ].join('\n');

// ── Onboarding ───────────────────────────────────────
const youIn = ({ activity, goal, unit }) =>
  [
    '🟠 YOU\'RE IN.',
    '',
    'Welcome to THE 100.',
    '',
    "I'll help you keep track of your progress, milestones and challenge.",
    '',
    'Your 100:',
    `${activity.toUpperCase()}`,
    `🎯 ${goal} ${unit}`,
    '📅 100 DAYS'
  ].join('\n');

const trackingChoice = () => ['ONE LAST THING.', '', 'How do you want to track your progress?'].join('\n');

const ready = () =>
  [
    'YOU\'RE READY.',
    '',
    'Your challenge is on the website.',
    "I'll handle the little things.",
    'Progress. Milestones. Reminders. Weekly recaps.',
    '',
    'Join the community group — that\u2019s where we move together.',
    '',
    "Let's move. 🟠"
  ].join('\n');

const welcomeBack = ({ name, activity, goal, unit, pct }) =>
  [
    `WELCOME BACK, ${name.toUpperCase()}. 🟠`,
    '',
    'YOUR 100',
    activity.toUpperCase(),
    `${goal} ${unit}`,
    `${pct}% COMPLETE`
  ].join('\n');

const whatsNext = () =>
  [
    'Your 100 is done.',
    '',
    'Next challenges and events open when they\u2019re ready \u2014 you\u2019ll hear about them here.',
    '',
    'For now: keep moving. 🟠'
  ].join('\n');

const stravaConnectPrompt = (url) =>
  [
    'CONNECT STRAVA',
    '',
    'Open the link, connect Strava, and THE 100 handles the rest.',
    '',
    'You can also keep logging manually any time.'
  ].join('\n');

// ── Group catalyst (2–4 messages/week, community group only) ──
const GROUP_STARTERS = [
  '🟠 WEEKLY CHECK-IN\n\nWhat\u2019s one thing you\u2019re proud of this week?\n\nBig or small.\nDrop it below.',
  'QUICK ONE:\n\nWhat time do you usually get your movement in?\n\n\u{1F305} Morning\n\u{2600}\u{FE0F} Afternoon\n\u{1F319} Evening\n\u{1F605} Whenever I can',
  'What\u2019s surprised you most about your 100 so far?',
  'LET\u2019S MEET SOME PEOPLE.\n\nWhat are you doing for your 100?\n\n\u{1F3C3} Running\n\u{1F6B6} Walking\n\u{1F6B4} Cycling\n\u{1F3C3}\u{1F6B6} Both\n\nDrop yours below.'
];

const groupConversationStarter = (index) => GROUP_STARTERS[((index % GROUP_STARTERS.length) + GROUP_STARTERS.length) % GROUP_STARTERS.length];

const groupMemberFirstStep = ({ name }) =>
  ['🟠 FIRST STEP.', '', `${name} just logged their first activity of The 100.`, '', `Welcome to the journey, ${name}. \u{1F44F}`].join('\n');

const groupMemberMilestone = ({ name, threshold, unit, goal }) =>
  ['🟠 ' + `${threshold} ${unit}.`, '', `${name} just crossed ${threshold} ${unit} toward their ${goal} ${unit} goal.`, '', 'Go give them a cheer. \u{1F44F}'].join('\n');

const groupMemberFinish = ({ name, goal, unit }) =>
  ['🟠 WE HAVE A FINISHER.', '', `${name.toUpperCase()} FINISHED THEIR 100.`, '', `${goal} ${unit}.`, '100 DAYS.', '', 'Go celebrate with them. \u{1F9E1}'].join('\n');

const GROUP_DAY_MSGS = {
  1: '🟠 DAY 1\n\nWe\u2019re officially underway.\n\nDifferent goals.\nDifferent journeys.\nSame 100 days.\n\nLet\u2019s move.',
  10: '10 DAYS IN.\n\nHow\u2019s your 100 going?',
  50: '🟠 HALFWAY.\n\n50 days down.\n50 to go.\n\nWhere are you at?',
  75: '75 DAYS.\n\nWe\u2019re in the final stretch.',
  90: '🟠 10 DAYS LEFT.\n\nWhatever your goal is,\nthe finish line is getting close.',
  99: 'TOMORROW.\n\n100 days.\n\nFinish what you started.',
  100: '🟠 DAY 100.\n\nToday is the finish line.\n\nShare your final result with the community.'
};

const groupChallengeMoment = (day) => GROUP_DAY_MSGS[day] || '';

const groupCollectiveDistance = ({ km, people }) =>
  ['🟠 WE JUST PASSED ' + `${km.toLocaleString('en-US')} KM.`, '', `${people} people.\nDifferent goals.`, `${km.toLocaleString('en-US')} KM moved together.`, '', 'Keep going.'].join('\n');

const groupWelcome = ({ name }) =>
  ['\u{1F44B} Welcome ' + `${name} to THE 100 community.`, '', 'Say hi when you\u2019re ready.'].join('\n');

// "People like me" — same goal, same journey. Never ranked.
const peopleLikeYou = ({ peers, goal, unit, activity }) => {
  const n = peers.length;
  const head = n ? `${n} other member${n === 1 ? '' : 's'} working toward ${goal} ${unit} ${(activity || 'MOVING').toLowerCase()} goals.` : 'No one else on this goal yet.';
  const list = peers.map((p) => `${p.name.toUpperCase()}\n${p.total} ${unit} / ${p.goal} ${unit}`).join('\n\n');
  return ['\u{1F465} PEOPLE LIKE YOU', '', head, '', list, '', 'Moving the same goal.\nNot ranked. Just together.'].join('\n');
};

module.exports = {
  bar,
  homeActive,
  homeNotStarted,
  homeComplete,
  progressMsg,
  logAskType,
  logAskDistance,
  logAskDate,
  logConfirm,
  milestonesMsg,
  milestoneHit,
  completion,
  activityConfirmed,
  challengeDay,
  weeklyRecap,
  reengage,
  communityPulse,
  settingsMsg,
  youIn,
  trackingChoice,
  ready,
  welcomeBack,
  whatsNext,
  stravaConnectPrompt,
  groupConversationStarter,
  groupMemberFirstStep,
  groupMemberMilestone,
  groupMemberFinish,
  groupChallengeMoment,
  groupCollectiveDistance,
  groupWelcome,
  peopleLikeYou
};