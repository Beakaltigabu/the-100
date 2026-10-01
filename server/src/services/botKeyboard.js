// Inline keyboard builders for THE 100 BOT. Pure data — no Telegram calls.

const home = () => [
  [{ text: '📊 MY PROGRESS', callback_data: 'progress' }, { text: '📝 LOG ACTIVITY', callback_data: 'log' }],
  [{ text: '🏁 MILESTONES', callback_data: 'milestones' }, { text: '👥 COMMUNITY', callback_data: 'community' }],
  [{ text: '⚙️ MORE', callback_data: 'more' }]
];

const progress = () => [
  [{ text: '📝 LOG ACTIVITY', callback_data: 'log' }],
  [{ text: '🌐 VIEW FULL DASHBOARD', url: undefined }], // filled by caller with clientOrigin
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

// Logging flow
const logType = (types) => [
  ...types.map((t) => [{ text: t.label, callback_data: `log_type:${t.key}` }]),
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

const logDistance = () => [
  [{ text: '3 KM', callback_data: 'log_dist:3' }, { text: '5 KM', callback_data: 'log_dist:5' }, { text: '10 KM', callback_data: 'log_dist:10' }],
  [{ text: 'ENTER DISTANCE', callback_data: 'log_dist:custom' }],
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

const logDate = () => [
  [{ text: 'TODAY', callback_data: 'log_date:today' }, { text: 'YESTERDAY', callback_data: 'log_date:yesterday' }],
  [{ text: 'CHOOSE DATE', callback_data: 'log_date:custom' }],
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

const logConfirm = () => [
  [{ text: '✅ CONFIRM', callback_data: 'log_confirm' }],
  [{ text: '↩️ START OVER', callback_data: 'log' }],
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

const milestones = () => [
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

const community = (groupUrl) => [
  [{ text: 'OPEN COMMUNITY', url: groupUrl }],
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

const more = () => [
  [{ text: '🔔 NOTIFICATIONS', callback_data: 'settings' }],
  [{ text: '👥 PEOPLE LIKE YOU', callback_data: 'people' }],
  [{ text: '📈 STRAVA', callback_data: 'strava' }],
  [{ text: '🌐 THE 100 WEBSITE', url: undefined }], // filled by caller
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

const settings = () => [
  [
    { text: 'MILESTONES', callback_data: 'settings:toggle:milestones' },
    { text: 'WEEKLY RECAP', callback_data: 'settings:toggle:weekly' },
    { text: 'COMMUNITY', callback_data: 'settings:toggle:community' }
  ],
  [{ text: 'REMINDERS: NEVER', callback_data: 'settings:reminders:never' }],
  [{ text: 'REMINDERS: OCCASIONALLY', callback_data: 'settings:reminders:occasionally' }],
  [{ text: 'REMINDERS: REGULARLY', callback_data: 'settings:reminders:regularly' }],
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

// Completion
const homeComplete = () => [
  [{ text: 'WHAT\u2019S NEXT?', callback_data: 'whats_next' }],
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

// Onboarding
const onboardSee = () => [
  [{ text: 'SEE MY 100', callback_data: 'onboard:see' }]
];

const trackingChoice = () => [
  [{ text: 'CONNECT STRAVA', callback_data: 'onboard:strava' }],
  [{ text: 'LOG MANUALLY', callback_data: 'onboard:manual' }],
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

// READY screen: instruct the member to join the community group.
const onboardReady = (groupUrl) => [
  [{ text: '👥 JOIN COMMUNITY', url: groupUrl }],
  [{ text: '⬅️ HOME', callback_data: 'home' }]
];

module.exports = { home, progress, logType, logDistance, logDate, logConfirm, milestones, community, more, settings, homeComplete, onboardSee, trackingChoice, onboardReady };