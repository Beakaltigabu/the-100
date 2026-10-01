// The app's canonical timezone. Challenge "day", weekly boundaries, and the
// daily digest all align to this zone (defaults to Ethiopia, UTC+3).
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Africa/Addis_Ababa';

const isoFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function formatInAppZone(d) {
  let y = '';
  let m = '';
  let day = '';
  for (const p of isoFmt.formatToParts(d)) {
    if (p.type === 'year') y = p.value;
    else if (p.type === 'month') m = p.value;
    else if (p.type === 'day') day = p.value;
  }
  return `${y}-${m}-${day}`;
}

function toDateISO(d) {
  return formatInAppZone(d);
}

function todayISO() {
  // Local date in APP_TIMEZONE, e.g. "2026-09-21". 'en-CA' yields YYYY-MM-DD.
  return formatInAppZone(new Date());
}

// Add/subtract whole days to an ISO date string. ISO strings are treated as
// dates in APP_TIMEZONE: they're moved on a UTC proxy (the zone offset is a
// fixed whole-hour shift), so the result never drifts with the host timezone.
function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Timezone-safe: shifts an ISO date string by `days` without local->UTC drift.
function addDaysISO(iso, days) {
  return addDays(iso, days);
}

function diffDays(fromISO, toISO) {
  const a = new Date(`${fromISO}T00:00:00`);
  const b = new Date(`${toISO}T00:00:00`);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

// Monday-start week in APP_TIMEZONE. `iso` is treated as a date in the app zone
// via a UTC proxy so the result is stable regardless of the host timezone.
function startOfWeek(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // Monday start
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function startOfWeekForDate(d) {
  return startOfWeek(formatInAppZone(d));
}

module.exports = { APP_TIMEZONE, toDateISO, todayISO, addDays, addDaysISO, diffDays, startOfWeek, startOfWeekForDate };