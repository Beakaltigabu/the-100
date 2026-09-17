// Password strength 0..4 for the auth strength meter.
export function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 10) score += 1;
  if (pw.length >= 14) score += 1;
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return score;
}

export function strengthLevel(score) {
  if (score <= 1) return 'weak';
  if (score <= 3) return 'ok';
  return 'strong';
}