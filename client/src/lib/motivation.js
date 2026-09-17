export const MOTIVATION_KEYS = [
  'health',
  'energy',
  'stress',
  'challenge',
  'community',
  'fitness',
  'weight',
  'sleep',
  'mind',
  'discipline'
];

export const MOTIVATION_MAX = 3;

export function motivationLabelKey(key) {
  return 'motivation' + key[0].toUpperCase() + key.slice(1);
}

export function motivationGuidanceKey(key) {
  return 'motivationGuidance' + key[0].toUpperCase() + key.slice(1);
}