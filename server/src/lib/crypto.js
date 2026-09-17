const crypto = require('crypto');
const config = require('../config');
const { AppError } = require('../middleware/errors');

function getKey() {
  const key = config.encryptionKey;
  if (!key || key.length < 32) {
    throw new AppError('ENCRYPTION_KEY must be set to a 32+ char secret', 500);
  }
  return crypto.createHash('sha256').update(key).digest();
}

function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

function decrypt(payload) {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new AppError('Invalid encrypted payload', 500);
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function hmac(secret, body) {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

module.exports = { encrypt, decrypt, sha256, hmac };