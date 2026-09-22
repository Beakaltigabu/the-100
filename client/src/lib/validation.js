// Returns the list of unmet password rules as translation keys (empty = OK).
export function passwordIssues(pw) {
  const issues = [];
  if (pw.length < 10) issues.push('passwordTooShort');
  if (!/[A-Za-z]/.test(pw)) issues.push('passwordNeedLetter');
  if (!/[0-9]/.test(pw)) issues.push('passwordNeedNumber');
  return issues;
}

// Maps a server-side 4xx into a clear, translatable message.
export function authErrorMessage(err, t) {
  const fe = err && err.details && err.details.fieldErrors;
  if (fe) {
    const field = Object.keys(fe).find((k) => Array.isArray(fe[k]) && fe[k].length);
    const key = { password: 'passwordTooShort', email: 'validEmailRequired', name: 'nameTooShort' }[field];
    if (key) return t(key);
  }
  return err.message || t('registerFail');
}