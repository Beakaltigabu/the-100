// One Strava athlete = one THE 100 account. Adds a unique constraint on
// strava_connections.strava_athlete_id (a single athlete can currently be
// linked to several accounts, which lets one person create many challenge
// accounts and get their activities counted multiple times).
//
// Duplicate athlete links are resolved by keeping the most recently connected
// row and nulling the older ones — those rows keep their tokens (bulk sync
// still works) but lose webhook routing, which is exactly the intended outcome:
// the athlete's activities now flow to ONE account. If duplicates indicate a
// real merge case (one person, two accounts), the admin duplicate tool handles it.
exports.up = async function up(knex) {
  const dupes = await knex('strava_connections')
    .whereNotNull('strava_athlete_id')
    .groupBy('strava_athlete_id')
    .having(knex.raw('COUNT(*) > 1'))
    .select('strava_athlete_id');

  for (const d of dupes) {
    const rows = await knex('strava_connections')
      .where({ strava_athlete_id: d.strava_athlete_id })
      .orderBy('connected_at', 'desc')
      .orderBy('id', 'desc')
      .select('id');
    if (!rows.length) continue;
    const keep = rows[0];
    const drop = rows.slice(1).map((r) => r.id);
    if (drop.length && keep) {
      await knex('strava_connections')
        .whereIn('id', drop)
        .update({ strava_athlete_id: null, updated_at: knex.fn.now() });
    }
  }

  // The unique index supersedes the earlier non-unique perf index — drop it if
  // (and only if) it exists so a partially-migrated DB can't abort the upgrade.
  const legacy = await knex.raw(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'strava_connections' AND index_name = 'strava_connections_strava_athlete_id_index' LIMIT 1"
  );
  if (legacy[0].length) {
    await knex.schema.alterTable('strava_connections', (t) => {
      t.dropIndex('strava_athlete_id');
    });
  }
  await knex.schema.alterTable('strava_connections', (t) => {
    t.unique('strava_athlete_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('strava_connections', (t) => {
    t.dropUnique('strava_athlete_id');
    t.index('strava_athlete_id');
  });
};