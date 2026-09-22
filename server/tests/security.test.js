import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { timingSafeEqualStr } from '../src/lib/timing';
import { validateConfig } from '../src/config/validate';
import { sanitizeName } from '../src/lib/sanitize';
import { signToken, verifyToken } from '../src/middleware/auth';
import { recordFailure, remainingBlock, clear } from '../src/lib/loginGuard';
import config from '../src/config';

describe('timingSafeEqualStr', () => {
  it('accepts equal strings', () => {
    expect(timingSafeEqualStr('abc123', 'abc123')).toBe(true);
  });

  it('rejects different strings', () => {
    expect(timingSafeEqualStr('abc123', 'abc124')).toBe(false);
  });

  it('handles empty / null safely without throwing', () => {
    expect(timingSafeEqualStr('', '')).toBe(true);
    expect(timingSafeEqualStr(null, 'x')).toBe(false);
    expect(timingSafeEqualStr(undefined, undefined)).toBe(true);
  });
});

describe('validateConfig', () => {
  const good = {
    JWT_SECRET: 's'.repeat(32),
    ENCRYPTION_KEY: 'x'.repeat(64),
    DB_PASSWORD: 'db-secret',
    CLIENT_ORIGIN: 'https://app.example.com',
    BASE_URL: 'https://api.example.com',
    COOKIE_SECURE: 'true',
    TELEGRAM_BOT_TOKEN: '123456789:AA-test-token'
  };

  it('accepts a fully-configured production env', () => {
    expect(validateConfig(good)).toEqual([]);
  });

  it('rejects the insecure default JWT secret', () => {
    const errors = validateConfig({ ...good, JWT_SECRET: 'insecure-dev-secret' });
    expect(errors.some((e) => e.includes('JWT_SECRET'))).toBe(true);
  });

  it('rejects a missing ENCRYPTION_KEY', () => {
    const errors = validateConfig({ ...good, ENCRYPTION_KEY: '' });
    expect(errors.some((e) => e.includes('ENCRYPTION_KEY'))).toBe(true);
  });

  it('rejects a short JWT_SECRET', () => {
    const errors = validateConfig({ ...good, JWT_SECRET: 'a-strong-secret-123' });
    expect(errors.some((e) => e.includes('JWT_SECRET'))).toBe(true);
  });

  it('rejects a short ENCRYPTION_KEY', () => {
    const errors = validateConfig({ ...good, ENCRYPTION_KEY: 'too-short' });
    expect(errors.some((e) => e.includes('ENCRYPTION_KEY'))).toBe(true);
  });

  it('rejects an empty DB_PASSWORD in production', () => {
    const errors = validateConfig({ ...good, DB_PASSWORD: '' });
    expect(errors.some((e) => e.includes('DB_PASSWORD'))).toBe(true);
  });

  it('rejects non-https client origin', () => {
    const errors = validateConfig({ ...good, CLIENT_ORIGIN: 'http://app.example.com' });
    expect(errors.some((e) => e.includes('CLIENT_ORIGIN'))).toBe(true);
  });

  it('rejects cookies sent without Secure in production', () => {
    const errors = validateConfig({ ...good, COOKIE_SECURE: 'false' });
    expect(errors.some((e) => e.includes('COOKIE_SECURE'))).toBe(true);
  });
});

describe('sanitizeName', () => {
  it('strips control characters and collapses whitespace', () => {
    expect(sanitizeName('  Abebe\n\t  Tesfaye  ')).toBe('Abebe Tesfaye');
  });

  it('caps length at 120', () => {
    expect(sanitizeName('x'.repeat(200))).toHaveLength(120);
  });

  it('trims and returns empty for whitespace-only input', () => {
    expect(sanitizeName('   ')).toBe('');
  });
});

describe('JWT hardening', () => {
  it('signs and verifies tokens with issuer/audience', () => {
    const token = signToken({ sub: 42 });
    const payload = verifyToken(token);
    expect(payload.sub).toBe(42);
  });

  it('rejects a token signed without the expected issuer/audience (old sessions)', () => {
    const legacy = jwt.sign({ sub: 42 }, config.jwt.secret, { expiresIn: '1h' });
    expect(() => verifyToken(legacy)).toThrow();
  });

  it('rejects tokens with a different algorithm (HS512)', () => {
    const forged = jwt.sign({ sub: 42 }, config.jwt.secret, { algorithm: 'HS512', expiresIn: '1h' });
    expect(() => verifyToken(forged)).toThrow();
  });
});

describe('loginGuard', () => {
  it('blocks after 5 failures and recovers after clear', () => {
    for (let i = 0; i < 5; i += 1) recordFailure('1.2.3.4', 'a@b.com');
    expect(remainingBlock('1.2.3.4', 'a@b.com')).toBeGreaterThan(0);
    clear('1.2.3.4', 'a@b.com');
    expect(remainingBlock('1.2.3.4', 'a@b.com')).toBe(0);
  });

  it('does not block other ip:email pairs', () => {
    recordFailure('1.2.3.4', 'a@b.com');
    expect(remainingBlock('5.6.7.8', 'a@b.com')).toBe(0);
    expect(remainingBlock('1.2.3.4', 'b@c.com')).toBe(0);
  });

  it('normalizes IPv4-mapped and IPv6 loopback', () => {
    for (let i = 0; i < 5; i += 1) recordFailure('::ffff:127.0.0.1', 'a@b.com');
    expect(remainingBlock('127.0.0.1', 'a@b.com')).toBeGreaterThan(0);
    clear('::1', 'a@b.com');
    expect(remainingBlock('127.0.0.1', 'a@b.com')).toBe(0);
  });

  it('keeps accumulating across remainingBlock checks (does not reset while not blocked)', () => {
    // Simulates a login attempt sequence: check (no block) -> failure.
    for (let i = 0; i < 4; i += 1) {
      expect(remainingBlock('9.9.9.9', 'c@d.com')).toBe(0);
      recordFailure('9.9.9.9', 'c@d.com');
    }
    expect(remainingBlock('9.9.9.9', 'c@d.com')).toBe(0);
    recordFailure('9.9.9.9', 'c@d.com'); // 5th -> block
    expect(remainingBlock('9.9.9.9', 'c@d.com')).toBeGreaterThan(0);
    clear('9.9.9.9', 'c@d.com');
  });
});