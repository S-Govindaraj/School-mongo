const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

const logAuditEvent = async ({
  schoolId = null,
  actorId = null,
  actorName = 'System',
  actorEmail = '',
  action,
  entity,
  entityId = '',
  details = {},
  ipAddress = '',
  userAgent = '',
}) => {
  try {
    await AuditLog.create({
      schoolId,
      actorId,
      actorName,
      actorEmail,
      action,
      entity,
      entityId,
      details,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    logger.error(`Failed to log audit event: ${error.message}`);
  }
};

module.exports = {
  logAuditEvent,
};
