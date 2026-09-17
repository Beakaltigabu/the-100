const crypto = require('crypto');
const { sha256 } = require('./crypto');

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return sha256(token);
}

module.exports = { generateToken, hashToken, sha256 };