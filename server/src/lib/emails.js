// Email normalization for duplicate-account prevention.
//
// Gmail/Googlemail treats dots and +aliases as the same mailbox
// (jane.smith@gmail.com == janesmith@gmail.com == jane+tag@gmail.com), so a
// member can otherwise create several THE 100 accounts that Strava/email
// recovery treat as one. Folding ONLY those providers keeps other domains
// untouched (dots and +s are significant for most mail systems).
function normalizeEmail(email) {
  const raw = String(email == null ? '' : email).trim().toLowerCase();
  const at = raw.indexOf('@');
  if (at <= 0) return raw;
  const local = raw.slice(0, at);
  let domain = raw.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    // googlemail.com and gmail.com are the same mailbox — fold to one domain.
    domain = 'gmail.com';
    return `${local.replace(/\./g, '').split('+')[0]}@${domain}`;
  }
  return raw;
}

module.exports = { normalizeEmail };