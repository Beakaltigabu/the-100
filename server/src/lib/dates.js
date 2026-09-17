function toDateISO(d) {
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return toDateISO(new Date());
}

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toDateISO(d);
}

// Timezone-safe: shifts an ISO date string by `days` without local->UTC drift.
function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function startOfWeek(iso) {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // Monday start
  d.setDate(d.getDate() - diff);
  return toDateISO(d);
}

function startOfWeekForDate(d) {
  return startOfWeek(toDateISO(d));
}

module.exports = { toDateISO, todayISO, addDays, addDaysISO, diffDays, startOfWeek, startOfWeekForDate };