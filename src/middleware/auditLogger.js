const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

const SENSITIVE_KEYS = ['password', 'token', 'access_token', 'refresh_token', 'authorization', 'cookie', 'otp', 'card', 'cvv'];

const redactSensitiveData = (data) => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(redactSensitiveData);

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

const logAuditEvent = ({
  schoolId = null,
  actorId = null,
  actorName = 'System',
  actorEmail = '',
  action,
  entity,
  entityId = '',
  oldValues = null,
  newValues = null,
  reason = '',
  requestId = '',
  details = {},
  ipAddress = '',
  userAgent = '',
}) => {
  // Fire-and-forget: do NOT await — audit writes must never block the API response
  AuditLog.create({
    schoolId,
    actorId,
    actorName,
    actorEmail,
    action,
    entity,
    entityId,
    oldValues: redactSensitiveData(oldValues),
    newValues: redactSensitiveData(newValues),
    reason,
    requestId,
    details: redactSensitiveData(details),
    ipAddress,
    userAgent,
  }).catch((error) => {
    logger.error(`Failed to log audit event: ${error.message}`);
  });
};

module.exports = {
  logAuditEvent,
  redactSensitiveData,
};
