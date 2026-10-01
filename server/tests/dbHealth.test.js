import { describe, it, expect, vi } from 'vitest';

// Fresh module instance per test so COOLDOWN_MS (read at load) and the
// saturatedUntil state never leak between cases.
async function freshDbHealth(backoffMs = 50) {
  vi.resetModules();
  process.env.DB_BACKOFF_MS = String(backoffMs);
  return import('../src/services/dbHealth.js');
}

describe('dbHealth (shared-MySQL circuit breaker)', () => {
  it('detects the 1040 saturation error', async () => {
    const dh = await freshDbHealth();
    expect(dh.isSaturatedError({ code: 'ER_CON_COUNT_ERROR', errno: 1040 })).toBe(true);
    expect(dh.isSaturatedError({ errno: 1040 })).toBe(true);
    expect(dh.isSaturatedError({ message: 'Too many connections' })).toBe(false);
    expect(dh.isSaturatedError(null)).toBe(false);
  });

  it('treats a pool acquire timeout (KnexTimeoutError) as saturation', async () => {
    const dh = await freshDbHealth(50);
    const knexErr = Object.assign(new Error('Knex: Timeout acquiring a connection. The pool is probably full.'), {
      name: 'KnexTimeoutError'
    });
    expect(dh.isSaturatedError(knexErr)).toBe(true);
    await dh.noteDbError(knexErr);
    expect(dh.dbHealthy()).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(dh.dbHealthy()).toBe(true);
  });

  it('marks the server unhealthy after a 1040 and recovers after the cooldown', async () => {
    const dh = await freshDbHealth(50);
    await dh.noteDbError({ code: 'ER_CON_COUNT_ERROR', errno: 1040 });
    expect(dh.dbHealthy()).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(dh.dbHealthy()).toBe(true);
  });

  it('ignores non-1040 errors', async () => {
    const dh = await freshDbHealth(50);
    await dh.noteDbError({ code: 'ER_BAD_FIELD_ERROR', errno: 1054 });
    expect(dh.dbHealthy()).toBe(true);
  });
});