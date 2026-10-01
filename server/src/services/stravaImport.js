const db = require('../db');
const { STRAVA_IMPORT_TYPES } = require('../constants');
const { APP_TIMEZONE, todayISO } = require('../lib/dates');

// Map a Strava activity type to an app type, or null if unsupported.
function mapStravaType(type) {
  const map = {
    Run: 'running',
    Walk: 'walking',
    Ride: 'cycling',
    Swim: 'swimming'
  };
  const appType = map[type];
  return appType && STRAVA_IMPORT_TYPES.includes(appType) ? appType : null;
}

// The calendar date of an activity in the app's timezone. The stored `date`
// column is the UTC date of start_date (stable for grouping/progress), but the
// challenge window is expressed in APP_TIMEZONE — so a run made just after
// midnight local must count toward the challenge's first day, not be dropped.
function localDateOf(startIso) {
  if (!startIso) return '';
  try {
    const d = new Date(startIso);
    if (Number.isNaN(d.getTime())) return startIso.slice(0, 10);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    let y = '';
    let m = '';
    let day = '';
    for (const p of fmt.formatToParts(d)) {
      if (p.type === 'year') y = p.value;
      else if (p.type === 'month') m = p.value;
      else if (p.type === 'day') day = p.value;
    }
    return `${y}-${m}-${day}`;
  } catch {
    return startIso.slice(0, 10);
  }
}

// Insert (or update) a Strava activity into THE 100. Skips unsupported types,
// virtual rides, zero-distance records, and activities outside the challenge
// window. Deduped via strava_activity_id.
async function importStravaActivity(enrollment, activity, objectId, challenge) {
  if (!activity || activity.type === 'VirtualRide') {
    return { imported: false, reason: 'skipped' };
  }
  const appType = mapStravaType(activity.type);
  if (!appType) {
    return { imported: false, reason: 'unsupported-type' };
  }
  const distanceKm = (activity.distance || 0) / 1000;
  if (distanceKm <= 0) {
    return { imported: false, reason: 'no-distance' };
  }
  const date = (activity.start_date || '').slice(0, 10);
  if (!date) {
    return { imported: false, reason: 'no-date' };
  }
  // Logging is enabled from today even before the official start; the lower
  // bound opens to today, end_date stays the hard cap. Compared in the app's
  // local timezone so the challenge boundaries line up with how members see
  // their "day".
  if (challenge) {
    const lower = todayISO() < challenge.start_date ? todayISO() : challenge.start_date;
    const windowDate = localDateOf(activity.start_date);
    if (windowDate < lower || windowDate > challenge.end_date) {
      return { imported: false, reason: 'out-of-window' };
    }
  }

  const payload = {
    enrollment_id: enrollment.id,
    date,
    quantity: Math.round(distanceKm * 100) / 100,
    activity_type: appType,
    source: 'strava',
    strava_activity_id: objectId
  };

  const existing = await db('challenge_activities').where({ strava_activity_id: objectId }).first();
  if (existing) {
    await db('challenge_activities').where({ id: existing.id }).update(payload);
  } else {
    await db('challenge_activities').insert(payload);
  }
  return { imported: true, type: appType, quantity: payload.quantity };
}

module.exports = { mapStravaType, localDateOf, importStravaActivity };