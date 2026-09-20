const mongoose = require('mongoose');
const ErrorLog = require('../models/ErrorLog');
const { successResponse, errorResponse } = require('../utils/response');
const {
  computeFingerprint,
  computeFrontendFingerprint,
  classifySeverity,
  classifyFrontendSeverity,
} = require('../utils/errorFingerprint');

/**
 * Get grouped error logs with filtering and pagination
 */
const getErrorLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const search = (req.query.search || '').trim();
    const severity = (req.query.severity || '').trim();
    const status = (req.query.status || '').trim();
    const source = (req.query.source || '').trim();
    const method = (req.query.method || '').trim();
    const from = req.query.from;
    const to = req.query.to;
    const sortField = req.query.sortField || 'lastSeenAt';
    const sortOrder = req.query.sortOrder === '1' || req.query.sortOrder === 1 ? 1 : -1;

    const matchStage = {};
    const andConditions = [];

    // Filter by school if schoolContext exists, including unscoped/system errors
    if (req.schoolContext?.schoolId) {
      andConditions.push({
        $or: [
          { schoolId: new mongoose.Types.ObjectId(req.schoolContext.schoolId) },
          { schoolId: null },
          { schoolId: { $exists: false } },
        ],
      });
    }

    if (severity) matchStage.severity = severity;
    if (status) matchStage.status = status;
    if (source) matchStage.source = source;
    if (method) matchStage.method = method;

    if (from || to) {
      matchStage.createdAt = {};
      if (from) matchStage.createdAt.$gte = new Date(from);
      if (to) matchStage.createdAt.$lte = new Date(to);
    }

    if (search) {
      andConditions.push({
        $or: [
          { message: { $regex: search, $options: 'i' } },
          { endpoint: { $regex: search, $options: 'i' } },
          { errorType: { $regex: search, $options: 'i' } },
          { requestId: { $regex: search, $options: 'i' } },
        ],
      });
    }

    if (andConditions.length > 0) {
      matchStage.$and = andConditions;
    }

    const [result] = await ErrorLog.getGroupedList(matchStage, {
      page,
      limit,
      sortField,
      sortOrder,
    });

    const data = result?.data || [];
    const total = result?.totalCount?.[0]?.count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    return successResponse(
      res,
      {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
      'Error logs retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get error metrics (overall totals and breakdown)
 */
const getErrorLogStats = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const [overallResult] = await ErrorLog.getScopedStats(schoolId);

    const stats = {
      overall: {
        totalErrors: overallResult?.totalErrors || 0,
        criticalErrors: overallResult?.criticalErrors || 0,
        warningErrors: overallResult?.warningErrors || 0,
        infoErrors: overallResult?.infoErrors || 0,
      },
    };

    return successResponse(res, stats, 'Error statistics retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get single error group details by fingerprint
 */
const getErrorLogGroup = async (req, res, next) => {
  try {
    const { fingerprint } = req.params;
    const schoolId = req.schoolContext?.schoolId;

    const query = { fingerprint };
    if (schoolId) query.schoolId = schoolId;

    const latest = await ErrorLog.findOne(query).sort({ createdAt: -1 }).lean();
    if (!latest) {
      return errorResponse(res, 'Error log group not found', 404, 'NOT_FOUND');
    }

    const [occurrenceStats] = await ErrorLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          occurrenceCount: { $sum: 1 },
          affectedUsers: { $addToSet: '$userId' },
          firstSeenAt: { $min: '$createdAt' },
          lastSeenAt: { $max: '$createdAt' },
        },
      },
    ]);

    const timeline = await ErrorLog.getGroupTimeline(fingerprint, schoolId);

    const affectedUserCount = (occurrenceStats?.affectedUsers || []).filter(Boolean).length;

    const groupDetail = {
      ...latest,
      occurrenceCount: occurrenceStats?.occurrenceCount || 1,
      affectedUserCount,
      firstSeenAt: occurrenceStats?.firstSeenAt || latest.createdAt,
      lastSeenAt: occurrenceStats?.lastSeenAt || latest.createdAt,
      timeline,
    };

    return successResponse(res, groupDetail, 'Error group details retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * Update error group status (e.g. INVESTIGATING, RESOLVED, IGNORED, OPEN)
 */
const updateErrorLogGroupStatus = async (req, res, next) => {
  try {
    const { fingerprint } = req.params;
    const { status } = req.body;
    const validStatuses = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED'];

    if (!validStatuses.includes(status)) {
      return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

      // Match the same school visibility as getErrorLogs (schoolId == user's school OR null/missing)
    // so system-level errors (schoolId null) that are visible to the user can also be resolved,
    // and a fingerprint that has both scoped and unscoped logs is fully resolved.
    let query;
    if (req.schoolContext?.schoolId) {
      const schoolId = new mongoose.Types.ObjectId(req.schoolContext.schoolId);
      query = {
        fingerprint,
        $or: [{ schoolId }, { schoolId: null }, { schoolId: { $exists: false } }],
      };
    } else {
      query = { fingerprint };
    }

    const result = await ErrorLog.updateMany(query, { $set: { status } });

    return successResponse(
      res,
      {
        fingerprint,
        status,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
      `Error group marked as ${status.toLowerCase()}`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Ingest client-side error report from browser
 */
const recordClientError = async (req, res, next) => {
  try {
    const {
      message = 'Client Error',
      stack = '',
      componentStack = '',
      errorKind = 'unhandled-exception',
      endpoint = '',
      url = '',
      route = '',
      routePattern = '',
      statusCode,
      errorType = 'ClientError',
      browser = '',
      os = '',
      device = '',
      method = '',
    } = req.body;

    const actualEndpoint = endpoint || url || routePattern || route || '/';
    const actualRoute = routePattern || route || actualEndpoint;
    const actualStatusCode = Number(statusCode) || (errorKind === 'api-failure' ? 400 : 500);

    const fingerprint = computeFrontendFingerprint({
      errorType,
      message,
      routePattern: actualRoute,
      errorKind,
      stack,
    });

    const severity = classifyFrontendSeverity({ errorKind, statusCode: actualStatusCode });

    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD', 'CLIENT'];
    const safeMethod = validMethods.includes(String(method).toUpperCase())
      ? String(method).toUpperCase()
      : 'CLIENT';

    const newLog = await ErrorLog.create({
      schoolId: req.schoolContext?.schoolId || req.user?.schoolId?._id || req.user?.schoolId || null,
      schoolName: req.schoolContext?.schoolName || req.user?.schoolId?.name || 'School ERP Client',
      fingerprint,
      source: 'frontend',
      errorKind,
      componentStack,
      userId: req.user?._id || req.user?.id || null,
      userName: req.user?.name || '',
      email: req.user?.email || '',
      role: req.user?.role?.name || req.user?.role || '',
      method: safeMethod,
      endpoint: actualEndpoint,
      route: actualRoute,
      statusCode: actualStatusCode,
      ipAddress: req.ip || '',
      browser,
      os,
      device,
      errorType,
      message,
      stack,
      severity,
      app: {
        environment: process.env.NODE_ENV || 'production',
        version: '1.0.0',
      },
    });

    return successResponse(res, { recorded: true, id: newLog._id, fingerprint }, 'Client error recorded', 201);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getErrorLogs,
  getErrorLogStats,
  getErrorLogGroup,
  updateErrorLogGroupStatus,
  recordClientError,
};
