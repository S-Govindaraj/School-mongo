const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const Student = require('../models/Student');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { resolveScopedGuardianIds } = require('../services/staffAccessScopeService');

// Staff In-Charge / Class Teacher guard for single-record guardian endpoints —
// throws the same NotFoundError a wrong-schoolId lookup already throws, so an
// out-of-scope record is indistinguishable from a nonexistent one.
async function assertGuardianInScope(req, schoolId, guardianId) {
  const scope = req.staffAccessScope;
  if (!scope || scope.mode === 'ALL') return;
  const allowed = await resolveScopedGuardianIds(scope, schoolId);
  if (allowed !== null && !allowed.includes(String(guardianId))) {
    throw new NotFoundError('Guardian not found');
  }
}

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

    const allowedGuardianIds = await resolveScopedGuardianIds(req.staffAccessScope, schoolId);
    if (allowedGuardianIds !== null) {
      query._id = { $in: allowedGuardianIds };
    }

    const [totalRecords, guardians] = await Promise.all([
      Guardian.countDocuments(query),
      Guardian.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    ]);

    // Attach linked students + their current Section/Class via Enrollment (gradeId/sectionId populated)
    const Enrollment = require('../models/Enrollment');
    const guardianIds = guardians.map((g) => g._id);
    const links = await StudentGuardian.find({ schoolId, guardianId: { $in: guardianIds } })
      .populate('studentId', 'firstName lastName studentNumber admissionNumber status')
      .lean();

    const linkMap = {};
    links.forEach((l) => {
      const gId = String(l.guardianId);
      if (!linkMap[gId]) linkMap[gId] = [];
      if (l.studentId) linkMap[gId].push(l.studentId);
    });

    // Resolve current enrollment per student for section/class
    const studentIds = [...new Set(links.map((l) => String(l.studentId?._id || l.studentId)).filter(Boolean))];
    const enrollmentMap = {};
    if (studentIds.length > 0) {
      const enrollments = await Enrollment.find({ schoolId, studentId: { $in: studentIds }, isCurrent: true })
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .lean();
      enrollments.forEach((e) => {
        enrollmentMap[String(e.studentId)] = {
          gradeId: e.gradeId?._id || e.gradeId || null,
          grade: e.gradeId?.name || null,
          sectionId: e.sectionId?._id || e.sectionId || null,
          section: e.sectionId?.name || null,
        };
      });
    }
    Object.keys(linkMap).forEach((gId) => {
      linkMap[gId] = linkMap[gId].map((s) => {
        const enr = enrollmentMap[String(s._id || s.id || s)] || {};
        return {
          ...s,
          gradeId: enr.gradeId ?? s.gradeId ?? null,
          grade: enr.grade ?? s.grade ?? null,
          sectionId: enr.sectionId ?? s.sectionId ?? null,
          section: enr.section ?? s.section ?? null,
        };
      });
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
    await assertGuardianInScope(req, schoolId, id);

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
    await assertGuardianInScope(req, schoolId, req.params.id);
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
    await assertGuardianInScope(req, schoolId, id);

    guardian.status = 'INACTIVE';
    await guardian.save();

    // If guardian was set as emergency contact on linked students, clear it
    const links = await StudentGuardian.find({ schoolId, guardianId: id });
    for (const link of links) {
      await Student.updateOne(
        { _id: link.studentId, schoolId, 'emergencyContact.name': guardian.name },
        { $set: { 'emergencyContact.name': '', 'emergencyContact.relationship': '', 'emergencyContact.phone': '' } }
      );
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'Guardian',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Guardian deactivated successfully');
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
    await assertGuardianInScope(req, schoolId, id);

    const oldValues = guardian.toObject();
    guardian.status = 'ACTIVE';
    await guardian.save();

    // If restored guardian is marked as emergency contact, re-link on linked students if empty
    if (guardian.isEmergencyContact) {
      const links = await StudentGuardian.find({ schoolId, guardianId: id });
      for (const link of links) {
        await Student.updateOne(
          { _id: link.studentId, schoolId, $or: [{ 'emergencyContact.name': '' }, { 'emergencyContact.name': null }] },
          { $set: { 'emergencyContact.name': guardian.name, 'emergencyContact.relationship': link.relationship || guardian.relationship, 'emergencyContact.phone': guardian.phone } }
        );
      }
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'Guardian',
      entityId: id,
      oldValues,
      newValues: guardian.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, guardian, 'Guardian activated successfully');
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
