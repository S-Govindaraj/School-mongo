const Grade = require('../models/Grade');
const Section = require('../models/Section');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
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

    const grades = await Grade.find(filter).sort({ sequenceOrder: 1, name: 1 });

    return successResponse(res, grades, 'Grades retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createGrade = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code, category = 'Primary', sequenceOrder = 1 } = req.body;

    const formattedCode = String(code || '').trim().toUpperCase();

    const existing = await Grade.findOne({ schoolId, code: formattedCode });
    if (existing && existing.status !== 'ARCHIVED') {
      throw new ValidationError(`Grade code '${formattedCode}' already exists in this school.`);
    }

    let grade;
    if (existing && existing.status === 'ARCHIVED') {
      existing.name = name;
      existing.category = category;
      existing.sequenceOrder = Number(sequenceOrder);
      existing.status = 'ACTIVE';
      grade = await existing.save();
    } else {
      grade = await Grade.create({
        schoolId,
        name,
        code: formattedCode,
        category,
        sequenceOrder: Number(sequenceOrder),
        status: 'ACTIVE',
      });
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
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
    Object.assign(grade, req.body);
    await grade.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
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

    const hasSections = await Section.countDocuments({ schoolId, gradeId: id, status: { $ne: 'ARCHIVED' } });
    const hasClassSubjects = await ClassSubject.countDocuments({ schoolId, gradeId: id, status: { $ne: 'ARCHIVED' } });
    const hasTeacherAssignments = await TeacherAssignment.countDocuments({ schoolId, gradeId: id, status: { $ne: 'ARCHIVED' } });

    if (hasSections > 0 || hasClassSubjects > 0 || hasTeacherAssignments > 0) {
      grade.status = 'INACTIVE';
      await grade.save();

      await logAuditEvent({
        schoolId,
        actorId: req.user._id,
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'DEACTIVATE',
        entity: 'Grade',
        entityId: grade._id.toString(),
        reason: 'Referenced by sections or class subjects - marked inactive for data integrity',
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return successResponse(res, null, 'Grade deactivated successfully (referenced by sections/class subjects)');
    }

    grade.status = 'INACTIVE';
    await grade.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
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
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
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
