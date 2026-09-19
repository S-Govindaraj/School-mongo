const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getGuardians = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { search = '', status = '', includeArchived, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId };
    if (status && status !== 'ALL') {
      query.status = status;
    } else if (includeArchived === 'false') {
      query.status = { $ne: 'ARCHIVED' };
    }
    if (search.trim()) {
      const s = String(search).trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
      ];
    }

    const [totalRecords, guardians] = await Promise.all([
      Guardian.countDocuments(query),
      Guardian.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    ]);

    // Attach linked students
    const guardianIds = guardians.map((g) => g._id);
    const links = await StudentGuardian.find({ schoolId, guardianId: { $in: guardianIds } })
      .populate('studentId', 'firstName lastName studentNumber status')
      .lean();

    const linkMap = {};
    links.forEach((l) => {
      const gId = String(l.guardianId);
      if (!linkMap[gId]) linkMap[gId] = [];
      if (l.studentId) linkMap[gId].push(l.studentId);
    });

    const formattedGuardians = guardians.map((g) => ({
      ...g,
      id: String(g._id),
      students: linkMap[String(g._id)] || [],
    }));

    return res.status(200).json({
      success: true,
      data: formattedGuardians,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const guardian = await Guardian.create({ ...req.body, schoolId });
    await logAuditEvent(req, 'CREATE', 'GUARDIAN', guardian._id, null, guardian);
    return successResponse(res, guardian, 'Guardian created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const guardian = await Guardian.findOne({ _id: id, schoolId });
    if (!guardian) throw new NotFoundError('Guardian not found');

    const previousState = guardian.toObject();
    Object.assign(guardian, req.body);
    await guardian.save();

    await logAuditEvent(req, 'UPDATE', 'GUARDIAN', id, previousState, guardian);
    return successResponse(res, guardian, 'Guardian updated successfully');
  } catch (error) {
    next(error);
  }
};

const getGuardianById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const guardian = await Guardian.findOne({ _id: req.params.id, schoolId });
    if (!guardian) throw new NotFoundError('Guardian not found');
    return successResponse(res, guardian, 'Guardian retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const linkGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId, guardianId, relationship, isPrimary, isEmergencyContact } = req.body;

    const link = await StudentGuardian.findOneAndUpdate(
      { schoolId, studentId, guardianId },
      { relationship, isPrimary: !!isPrimary, isEmergencyContact: !!isEmergencyContact },
      { upsert: true, new: true }
    );

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'LINK',
      entity: 'StudentGuardian',
      entityId: link._id.toString(),
      newValues: link.toObject ? link.toObject() : link,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, link, 'Guardian linked to student successfully');
  } catch (error) {
    next(error);
  }
};

const deleteGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const guardian = await Guardian.findOne({ _id: id, schoolId });
    if (!guardian) {
      throw new NotFoundError('Guardian not found.');
    }

    guardian.status = 'ARCHIVED';
    await guardian.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ARCHIVE',
      entity: 'Guardian',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Guardian archived successfully');
  } catch (error) {
    next(error);
  }
};

const restoreGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const guardian = await Guardian.findOne({ _id: id, schoolId });
    if (!guardian) {
      throw new NotFoundError('Guardian not found.');
    }

    const oldValues = guardian.toObject();
    guardian.status = 'ACTIVE';
    await guardian.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'RESTORE',
      entity: 'Guardian',
      entityId: id,
      oldValues,
      newValues: guardian.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, guardian, 'Guardian restored successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGuardians,
  getGuardianById,
  createGuardian,
  updateGuardian,
  deleteGuardian,
  restoreGuardian,
  linkGuardian,
  linkGuardianToStudent: linkGuardian,
};
