const AuditLog = require('../models/AuditLog');
const { successResponse } = require('../utils/response');

const getAuditLogs = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;

    const total = await AuditLog.countDocuments({});
    const logs = await AuditLog.find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return successResponse(
      res,
      logs,
      'Audit logs retrieved',
      200,
      {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuditLogs,
};
