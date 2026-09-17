// V1 shipped activity set: running + walkers + swimming (all km).
// The architecture is activity-aware, so re-enabling more is a config-level change.
export const ACTIVITY_KEYS = ['running', 'walking', 'run_walk', 'cycling', 'swimming'];

export const ACTIVITY_SUBTITLE_KEYS = {
  running: 'activitySubRunning',
  walking: 'activitySubWalking',
  run_walk: 'activitySubRunWalk',
  cycling: 'activitySubCycling',
  swimming: 'activitySubSwimming'
};

export const DISTANCE_ACTIVITIES = ['running', 'walking', 'run_walk', 'cycling', 'swimming'];

export function unitKey() {
  return 'km';
}

export const ACTIVITY_MILESTONES = {
  running: [10, 50, 100, 250, 500, 750, 1000],
  walking: [10, 50, 100, 250, 500, 750, 1000],
  run_walk: [10, 50, 100, 250, 500, 750, 1000],
  cycling: [10, 50, 100, 250, 500, 750, 1000],
  swimming: [5, 15, 30, 60, 100]
};

export function milestonesForActivity(activityType) {
  return ACTIVITY_MILESTONES[activityType] || ACTIVITY_MILESTONES.running;
}

// Baseline weekly options keyed by activity group.
// value = stored numeric midpoint; label = translation key.
export const BASELINE_OPTIONS = {
  distance: [
    { value: 5, label: 'under10' },
    { value: 15, label: 'km10to20' },
    { value: 30, label: 'km20to40' },
    { value: 50, label: 'km40to60' },
    { value: 70, label: 'km60to80' },
    { value: 90, label: 'over80' }
  ],
  swimming: [
    { value: 1, label: 'swimUnder2' },
    { value: 3.5, label: 'swim2to5' },
    { value: 7.5, label: 'swim5to10' },
    { value: 12.5, label: 'swimOver10' }
  ]
};

export function baselineOptionsFor(activityType) {
  return activityType === 'swimming' ? BASELINE_OPTIONS.swimming : BASELINE_OPTIONS.distance;
}

export function maxGoal() {
  return 10000;
}