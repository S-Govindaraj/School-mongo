const mongoose = require('mongoose');

const auditTrailSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorType: {
      type: String,
      enum: ['USER', 'SYSTEM', 'API_KEY', 'PLATFORM_ADMIN', 'WEBHOOK'],
      default: 'USER',
    },
    actorEmail: String,
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true }, // e.g. 'Student', 'Invoice'
    resourceId: { type: String, index: true },
    changes: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
    },
    metadata: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    requestId: String,
    result: {
      type: String,
      enum: ['SUCCESS', 'FAILURE', 'PARTIAL'],
      default: 'SUCCESS',
    },
    errorMessage: String,
    duration: Number, // ms
  },
  { timestamps: true }
);

auditTrailSchema.index({ schoolId: 1, createdAt: -1 });
auditTrailSchema.index({ actorId: 1, createdAt: -1 });
auditTrailSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditTrailSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 }); // Auto-expire after 1 year (configurable)

module.exports = mongoose.model('AuditTrail', auditTrailSchema);
