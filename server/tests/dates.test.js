import { describe, it, expect } from 'vitest';
import { addDays, addDaysISO, diffDays, startOfWeek, todayISO } from '../src/lib/dates';

describe('lib/dates — app-timezone-safe week/date math', () => {
  it('addDays is timezone-stable (no host-tz drift)', () => {
    expect(addDays('2026-09-28', 1)).toBe('2026-09-29');
    expect(addDays('2026-09-28', -1)).toBe('2026-09-27');
    expect(addDaysISO('2026-09-28', 1)).toBe('2026-09-29');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('startOfWeek returns the Monday of the same week', () => {
    // 2026-09-28 is a Monday in the app zone.
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28');
    // 2026-10-04 is a Sunday -> that week's Monday.
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28');
    expect(startOfWeek('2026-09-30')).toBe('2026-09-28');
    expect(startOfWeek('2026-10-06')).toBe('2026-10-05');
  });

  it('diffDays counts calendar days between ISO strings', () => {
    expect(diffDays('2026-09-28', '2026-09-28')).toBe(0);
    expect(diffDays('2026-09-27', '2026-09-28')).toBe(1);
    expect(diffDays('2026-09-28', '2026-09-27')).toBe(-1);
  });

  it('todayISO returns a valid YYYY-MM-DD in the app zone', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});