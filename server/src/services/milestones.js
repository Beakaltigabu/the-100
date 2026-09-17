const db = require('../db');
const { milestonesForActivity } = require('../constants');

async function createMilestonesForEnrollment(enrollmentId, activityType, trx) {
  const thresholds = milestonesForActivity(activityType);
  const rows = thresholds.map((threshold) => ({
    enrollment_id: enrollmentId,
    threshold
  }));
  if (trx) {
    await trx('milestones').insert(rows);
  } else {
    await db('milestones').insert(rows);
  }
}

// Pure: given milestone rows and a total, returns the thresholds newly crossed.
function computeReachedMilestones(milestones, total) {
  const reached = [];
  for (const m of milestones) {
    if (!m.reached_at && total >= Number(m.threshold)) {
      reached.push(Number(m.threshold));
    }
  }
  return reached;
}

async function syncMilestones(enrollmentId, total) {
  const milestones = await db('milestones').where({ enrollment_id: enrollmentId });
  const reached = computeReachedMilestones(milestones, total);
  for (const threshold of reached) {
    await db('milestones')
      .where({ enrollment_id: enrollmentId, threshold })
      .update({ reached_at: db.fn.now() });
  }
  return reached;
}

module.exports = { createMilestonesForEnrollment, computeReachedMilestones, syncMilestones };