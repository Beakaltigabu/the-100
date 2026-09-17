const crypto = require('crypto');

// Constant-time string comparison. Hashes both sides first so length is not
// leaked, then uses timingSafeEqual on the digests.
function timingSafeEqualStr(a, b) {
  const left = crypto.createHash('sha256').update(String(a == null ? '' : a)).digest();
  const right = crypto.createHash('sha256').update(String(b == null ? '' : b)).digest();
  return crypto.timingSafeEqual(left, right);
}

module.exports = { timingSafeEqualStr };