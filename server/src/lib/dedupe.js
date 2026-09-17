// Returns true if a manual log on the given date would overlap an existing
// Strava-imported activity on the same date (prevents double counting).
function hasStravaOverlap(existingRowsForDate) {
  return (existingRowsForDate || []).some((row) => row.source === 'strava');
}

module.exports = { hasStravaOverlap };