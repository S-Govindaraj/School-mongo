const mongoose = require('mongoose');

const ErrorLogSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      default: null,
      index: true,
    },
    schoolName: {
      type: String,
      default: 'School ERP',
      trim: true,
    },

    fingerprint: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED'],
      default: 'OPEN',
      index: true,
    },

    source: {
      type: String,
      enum: ['backend', 'frontend'],
      default: 'backend',
      index: true,
    },
    errorKind: {
      type: String,
      enum: ['', 'render', 'unhandled-exception', 'unhandled-rejection', 'api-failure', 'manual'],
      default: '',
    },
    componentStack: {
      type: String,
      default: '',
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    userName: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    role: { type: String, default: '', trim: true },
    department: { type: String, default: '', trim: true },

    authContext: {
      authenticated: { type: Boolean, default: false },
      authMethod: { type: String, default: '' },
      permissions: { type: [String], default: undefined },
    },

    requestId: { type: String, default: '', index: true },
    correlationId: { type: String, default: '', index: true },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD', 'CLIENT'],
      default: 'GET',
    },
    endpoint: { type: String, required: true, trim: true },
    route: {
      type: String,
      default: '',
      trim: true,
    },
    statusCode: { type: Number, default: 500, min: 100, max: 599 },
    durationMs: { type: Number, default: null },

    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    query: { type: mongoose.Schema.Types.Mixed, default: null },
    params: { type: mongoose.Schema.Types.Mixed, default: null },
    headers: { type: mongoose.Schema.Types.Mixed, default: null },

    ipAddress: { type: String, default: '' },
    browser: { type: String, default: '' },
    device: { type: String, default: '' },
    os: { type: String, default: '' },

    errorType: { type: String, default: '', trim: true },
    errorCode: { type: String, default: '', trim: true },
    message: { type: String, required: true, trim: true },
    stack: { type: String, default: '' },
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'error',
      index: true,
    },

    app: {
      environment: { type: String, default: process.env.NODE_ENV || 'production' },
      version: { type: String, default: '1.0.0' },
      gitCommit: { type: String, default: '' },
      nodeVersion: { type: String, default: process.version },
    },
    runtime: {
      hostname: { type: String, default: '' },
      pid: { type: Number, default: null },
      memoryMb: { type: Number, default: null },
      uptimeSec: { type: Number, default: null },
    },
    dependency: {
      name: { type: String, default: '' },
      status: { type: String, default: '' },
      error: { type: String, default: '' },
    },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

ErrorLogSchema.index({ createdAt: -1 });
ErrorLogSchema.index({ status: 1, severity: 1, createdAt: -1 });
ErrorLogSchema.index({ fingerprint: 1, createdAt: -1 });
ErrorLogSchema.index({ source: 1, createdAt: -1 });
ErrorLogSchema.index({ endpoint: 1, severity: 1, createdAt: -1 });

ErrorLogSchema.statics.getPlatformStats = function () {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalErrors: { $sum: 1 },
        criticalErrors: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        warningErrors: { $sum: { $cond: [{ $eq: ['$severity', 'warning'] }, 1, 0] } },
        infoErrors: { $sum: { $cond: [{ $eq: ['$severity', 'info'] }, 1, 0] } },
      },
    },
  ]);
};

ErrorLogSchema.statics.getScopedStats = function (schoolId) {
  const match = schoolId
    ? {
        $or: [
          { schoolId: new mongoose.Types.ObjectId(schoolId) },
          { schoolId: null },
          { schoolId: { $exists: false } },
        ],
      }
    : {};
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalErrors: { $sum: 1 },
        criticalErrors: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        warningErrors: { $sum: { $cond: [{ $eq: ['$severity', 'warning'] }, 1, 0] } },
        infoErrors: { $sum: { $cond: [{ $eq: ['$severity', 'info'] }, 1, 0] } },
      },
    },
  ]);
};

ErrorLogSchema.statics.getGroupedList = function (matchStage, { page = 1, limit = 20, sortField = 'lastSeenAt', sortOrder = -1 } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  return this.aggregate([
    { $match: matchStage },
    { $sort: { fingerprint: 1, createdAt: -1 } },
    {
      $group: {
        _id: '$fingerprint',
        fingerprint: { $first: '$fingerprint' },
        message: { $first: '$message' },
        errorType: { $first: '$errorType' },
        severity: { $first: '$severity' },
        status: { $first: '$status' },
        source: { $first: '$source' },
        errorKind: { $first: '$errorKind' },
        method: { $first: '$method' },
        endpoint: { $first: '$endpoint' },
        route: { $first: '$route' },
        statusCode: { $first: '$statusCode' },
        schoolId: { $first: '$schoolId' },
        schoolName: { $first: '$schoolName' },
        environment: { $first: '$app.environment' },
        version: { $first: '$app.version' },
        occurrenceCount: { $sum: 1 },
        affectedUsers: { $addToSet: '$userId' },
        firstSeenAt: { $min: '$createdAt' },
        lastSeenAt: { $max: '$createdAt' },
        latestId: { $first: '$_id' },
      },
    },
    {
      $project: {
        _id: 0,
        fingerprint: 1,
        message: 1,
        errorType: 1,
        severity: 1,
        status: 1,
        source: 1,
        errorKind: 1,
        method: 1,
        endpoint: 1,
        route: 1,
        statusCode: 1,
        schoolId: 1,
        schoolName: 1,
        environment: 1,
        version: 1,
        occurrenceCount: 1,
        affectedUserCount: {
          $size: {
            $filter: {
              input: '$affectedUsers',
              cond: { $ne: ['$$this', null] },
            },
          },
        },
        firstSeenAt: 1,
        lastSeenAt: 1,
        latestId: 1,
      },
    },
    { $sort: { [sortField]: sortOrder } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]);
};

ErrorLogSchema.statics.getGroupTimeline = function (fingerprint, schoolId) {
  const match = { fingerprint };
  if (schoolId) match.schoolId = new mongoose.Types.ObjectId(schoolId);

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%dT%H:00:00', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: 50 },
    { $project: { _id: 0, bucket: '$_id', count: 1 } },
  ]);
};

module.exports = mongoose.model('ErrorLog', ErrorLogSchema);
