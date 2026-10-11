import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '../src/lib/emails';

describe('normalizeEmail', () => {
  it('trims and lowercases non-gmail addresses', () => {
    expect(normalizeEmail('  Jane.Doe@Example.com ')).toBe('jane.doe@example.com');
  });

  it('folds Gmail dots (jane.smith == janesmith)', () => {
    expect(normalizeEmail('jane.smith@gmail.com')).toBe('janesmith@gmail.com');
    expect(normalizeEmail('janesmith@gmail.com')).toBe('janesmith@gmail.com');
  });

  it('folds Gmail plus aliases', () => {
    expect(normalizeEmail('jane+the100@gmail.com')).toBe('jane@gmail.com');
    expect(normalizeEmail('jane.smith+tag@gmail.com')).toBe('janesmith@gmail.com');
  });

  it('treats googlemail like gmail', () => {
    expect(normalizeEmail('jane.smith@googlemail.com')).toBe('janesmith@gmail.com');
  });

  it('does NOT fold dots or plus for other providers', () => {
    expect(normalizeEmail('jane+tag@fastmail.com')).toBe('jane+tag@fastmail.com');
    expect(normalizeEmail('jane.smith@fastmail.com')).toBe('jane.smith@fastmail.com');
  });

  it('handles empty/garbage input without throwing', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});