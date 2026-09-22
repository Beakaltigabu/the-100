// The app's canonical timezone. Challenge "day", weekly boundaries, and the
// daily digest all align to this zone (defaults to Ethiopia, UTC+3).
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Africa/Addis_Ababa';

function toDateISO(d) {
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  // Local date in APP_TIMEZONE, e.g. "2026-09-21". 'en-CA' yields YYYY-MM-DD.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  let y = '';
  let m = '';
  let d = '';
  for (const p of fmt.formatToParts(new Date())) {
    if (p.type === 'year') y = p.value;
    else if (p.type === 'month') m = p.value;
    else if (p.type === 'day') d = p.value;
  }
  return `${y}-${m}-${d}`;
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

module.exports = { APP_TIMEZONE, toDateISO, todayISO, addDays, addDaysISO, diffDays, startOfWeek, startOfWeekForDate };