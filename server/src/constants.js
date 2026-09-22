const ACTIVITY_TYPES = ['running', 'walking', 'run_walk', 'cycling', 'swimming', 'resistance', 'other'];

const DISTANCE_ACTIVITIES = ['running', 'walking', 'run_walk', 'cycling', 'swimming', 'other'];

// Strava activity types we're willing to import into THE 100 (app-supported).
const STRAVA_IMPORT_TYPES = ['running', 'walking', 'cycling', 'swimming'];

const ACTIVITY_UNIT = {
  running: 'km',
  walking: 'km',
  run_walk: 'km',
  cycling: 'km',
  swimming: 'km',
  resistance: 'sessions',
  other: 'km'
};

const UNIT_LABEL = {
  km: 'KM',
  sessions: 'SESSIONS'
};

const ACTIVITY_MILESTONES = {
  running: [10, 50, 100, 250, 500, 750, 1000],
  walking: [10, 50, 100, 250, 500, 750, 1000],
  run_walk: [10, 50, 100, 250, 500, 750, 1000],
  cycling: [10, 50, 100, 250, 500, 750, 1000],
  swimming: [5, 15, 30, 60, 100],
  resistance: [10, 25, 50, 75, 100, 150, 200],
  other: [10, 50, 100, 250, 500, 750, 1000]
};

// Recommendation bands per activity: [comfortable, challenging, serious, extreme]
// baseline is the weekly value in the activity's unit.
function recommendGoals(activityType, baseline) {
  const base = Number(baseline) || 0;

  if (activityType === 'resistance') {
    if (base < 2) return [30, 45, 60, 90];
    if (base < 4) return [45, 60, 90, 120];
    return [60, 90, 120, 150];
  }

  if (activityType === 'swimming') {
    if (base < 2) return [15, 30, 60, 100];
    if (base < 5) return [30, 60, 100, 150];
    if (base < 10) return [60, 100, 150, 200];
    return [100, 150, 200, 300];
  }

  // distance activities (running, walking, run_walk, cycling, other)
  if (base < 10) return [50, 100, 250, 500];
  if (base < 20) return [100, 250, 500, 1000];
  if (base < 40) return [250, 500, 750, 1000];
  return [500, 750, 1000, 1500];
}

function milestonesForActivity(activityType) {
  return ACTIVITY_MILESTONES[activityType] || ACTIVITY_MILESTONES.running;
}

function unitForActivity(activityType) {
  return ACTIVITY_UNIT[activityType] || 'km';
}

function maxGoalForUnit(unit) {
  return unit === 'sessions' ? 365 : 10000;
}

module.exports = {
  ACTIVITY_TYPES,
  DISTANCE_ACTIVITIES,
  STRAVA_IMPORT_TYPES,
  ACTIVITY_UNIT,
  UNIT_LABEL,
  ACTIVITY_MILESTONES,
  EXPERIENCE_LEVELS: ['beginner', 'occasional', 'consistent', 'experienced'],
  ENROLLMENT_STATUS: ['committed', 'active', 'completed', 'abandoned'],
  ACTIVITY_SOURCE: ['manual', 'strava'],
  TELEGRAM_STATES: [
    'not_connected',
    'invite_generated',
    'join_requested',
    'approved',
    'active',
    'left',
    'removed'
  ],
  NOTIFICATION_TYPES: [
    'welcome',
    'commitment',
    'milestone',
    'weekly_checkin',
    'inactivity',
    'finish'
  ],

  GOAL_BANDS: [
    { level: 'start', km: 50 },
    { level: 'build', km: 100 },
    { level: 'commit', km: 250 },
    { level: 'push', km: 500 },
    { level: 'extreme', km: 750 },
    { level: '1k', km: 1000 }
  ],

  TOTAL_DAYS: 100,

  ON_TRACK_TOLERANCE: 0.9,

  recommendGoals,
  milestonesForActivity,
  unitForActivity,
  maxGoalForUnit
};