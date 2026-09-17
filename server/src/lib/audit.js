const db = require('../db');

async function audit(adminUserId, action, targetType = null, targetId = null, ip = null) {
  try {
    await db('admin_audit_log').insert({
      admin_user_id: adminUserId,
      action,
      target_type: targetType,
      target_id: targetId == null ? null : String(targetId),
      ip
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { audit };