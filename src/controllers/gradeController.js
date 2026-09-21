const Grade = require('../models/Grade');
const Section = require('../models/Section');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const Enrollment = require('../models/Enrollment');
const Timetable = require('../models/Timetable');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getGrades = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, includeArchived } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }

    const grades = await Grade.find(filter).sort({ sequenceOrder: 1, name: 1 }).lean();

    // Attach each grade's configured sections — one grouped query instead of
    // an N+1 lookup per grade, so the frontend never needs to fetch/join
    // Sections separately just to render this column.
    const gradeIds = grades.map((g) => g._id);
    const sections = gradeIds.length
      ? await Section.find({ schoolId, gradeId: { $in: gradeIds }, status: { $ne: 'ARCHIVED' } })
          .select('name code gradeId')
          .sort({ name: 1 })
          .lean()
      : [];
    const sectionsByGrade = new Map();
    sections.forEach((s) => {
      const key = String(s.gradeId);
      if (!sectionsByGrade.has(key)) sectionsByGrade.set(key, []);
      sectionsByGrade.get(key).push({ _id: s._id, name: s.name, code: s.code });
    });

    const gradesWithSections = grades.map((g) => ({
      ...g,
      sections: sectionsByGrade.get(String(g._id)) || [],
    }));

    return successResponse(res, gradesWithSections, 'Grades retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createGrade = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code, category = 'Primary', sequenceOrder = 1, status: requestedStatus } = req.body;

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new ValidationError('Grade name is required.');
    }
    const formattedCode = String(code || '').trim().toUpperCase();
    if (!formattedCode) {
      throw new ValidationError('Grade code is required.');
    }

    const seqNum = Number(sequenceOrder);
    if (!Number.isInteger(seqNum) || seqNum <= 0) {
      throw new ValidationError('Display order must be a positive integer.');
    }

    // Parallel duplicate checks: code + order
    const [existingCode, existingOrder] = await Promise.all([
      Grade.findOne({ schoolId, code: formattedCode, status: { $ne: 'ARCHIVED' } }),
      Grade.findOne({ schoolId, sequenceOrder: seqNum, status: { $ne: 'ARCHIVED' } }),
    ]);
    if (existingCode) throw new ValidationError(`Grade code '${formattedCode}' already exists in this school.`);
    if (existingOrder) throw new ValidationError(`Display order '${seqNum}' is already assigned to grade '${existingOrder.name}'.`);

    const status = requestedStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';

    const grade = await Grade.create({
      schoolId,
      name: trimmedName,
      code: formattedCode,
      category,
      sequenceOrder: seqNum,
      status,
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'CREATE',
      entity: 'Grade',
      entityId: grade._id.toString(),
      newValues: grade.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, grade, 'Grade created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateGrade = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const grade = await Grade.findOne({ _id: id, schoolId });
    if (!grade) {
      throw new NotFoundError('Grade not found.');
    }

    const oldValues = grade.toObject();

    if (req.body.code && String(req.body.code).trim().toUpperCase() !== grade.code) {
      const formattedCode = String(req.body.code).trim().toUpperCase();
      const existing = await Grade.findOne({
        _id: { $ne: id },
        schoolId,
        code: formattedCode,
        status: { $ne: 'ARCHIVED' },
      });
      if (existing) {
        throw new ValidationError(`Grade code '${formattedCode}' already exists in this school.`);
      }
      grade.code = formattedCode;
    }

    if (req.body.sequenceOrder !== undefined && Number(req.body.sequenceOrder) !== grade.sequenceOrder) {
      const seqNum = Number(req.body.sequenceOrder);
      if (!Number.isInteger(seqNum) || seqNum <= 0) {
        throw new ValidationError('Display order must be a positive integer.');
      }
      const existing = await Grade.findOne({
        _id: { $ne: id },
        schoolId,
        sequenceOrder: seqNum,
        status: { $ne: 'ARCHIVED' },
      });
      if (existing) {
        throw new ValidationError(`Display order '${seqNum}' is already assigned to grade '${existing.name}'.`);
      }
      grade.sequenceOrder = seqNum;
    }

    if (req.body.name) grade.name = String(req.body.name).trim();
    if (req.body.category) grade.category = req.body.category;
    if (req.body.status) grade.status = req.body.status;

    await grade.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'UPDATE',
      entity: 'Grade',
      entityId: grade._id.toString(),
      oldValues,
      newValues: grade.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, grade, 'Grade updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteGrade = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const grade = await Grade.findOne({ _id: id, schoolId });
    if (!grade) {
      throw new NotFoundError('Grade not found.');
    }

    const [hasSections, hasClassSubjects, hasTeacherAssignments, hasEnrollments, hasTimetable] = await Promise.all([
      Section.countDocuments({ schoolId, gradeId: id, status: { $ne: 'ARCHIVED' } }),
      ClassSubject.countDocuments({ schoolId, gradeId: id, status: { $ne: 'ARCHIVED' } }),
      TeacherAssignment.countDocuments({ schoolId, gradeId: id, status: { $ne: 'ARCHIVED' } }),
      Enrollment.countDocuments({ schoolId, gradeId: id, status: { $ne: 'ARCHIVED' } }),
      Timetable.countDocuments({ schoolId, gradeId: id, status: { $ne: 'ARCHIVED' } }),
    ]);

    if (hasSections > 0 || hasClassSubjects > 0 || hasTeacherAssignments > 0 || hasEnrollments > 0 || hasTimetable > 0) {
      throw new ValidationError('This grade cannot be deleted because related records exist (sections, class subjects, or enrollments).');
    }

    grade.status = 'INACTIVE';
    await grade.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'Grade',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Grade deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restoreGrade = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const grade = await Grade.findOne({ _id: id, schoolId });
    if (!grade) {
      throw new NotFoundError('Grade not found.');
    }

    grade.status = 'ACTIVE';
    await grade.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'Grade',
      entityId: grade._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, grade, 'Grade activated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGrades,
  createGrade,
  updateGrade,
  deleteGrade,
  restoreGrade,
};
