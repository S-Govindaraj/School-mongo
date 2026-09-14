const AuditLog = require('../models/AuditLog');
const { successResponse } = require('../utils/response');

const getAuditLogs = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const search = (req.query.search || '').trim();

    const query = { schoolId };
    if (search) {
      query.$or = [
        { action: { $regex: search, $options: 'i' } },
        { entity: { $regex: search, $options: 'i' } },
        { actorName: { $regex: search, $options: 'i' } },
        { actorEmail: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return successResponse(
      res,
      {
        items: logs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
      'Audit logs retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuditLogs,
};
