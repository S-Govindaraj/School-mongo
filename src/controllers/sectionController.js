const Section = require('../models/Section');
const Grade = require('../models/Grade');
const TeacherAssignment = require('../models/TeacherAssignment');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getSections = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { gradeId, status, includeArchived } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }

    if (gradeId) {
      filter.gradeId = gradeId;
    }

    const sections = await Section.find(filter)
      .populate('gradeId')
      .sort({ code: 1, name: 1 });

    return successResponse(res, sections, 'Sections retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createSection = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { gradeId, name, code, capacity = 40, room = '' } = req.body;

    const grade = await Grade.findOne({ _id: gradeId, schoolId });
    if (!grade) {
      throw new ValidationError('Selected grade does not exist in this school.');
    }

    if (Number(capacity) < 0) {
      throw new ValidationError('Section capacity must be greater than or equal to 0.');
    }

    const formattedCode = String(code || '').trim().toUpperCase();

    const existing = await Section.findOne({ schoolId, gradeId, code: formattedCode });
    if (existing && existing.status !== 'ARCHIVED') {
      throw new ValidationError(`Section code '${formattedCode}' already exists in this grade.`);
    }

    let section;
    if (existing && existing.status === 'ARCHIVED') {
      existing.name = name;
      existing.capacity = Number(capacity);
      existing.room = room;
      existing.status = 'ACTIVE';
      section = await existing.save();
    } else {
      section = await Section.create({
        schoolId,
        gradeId,
        name,
        code: formattedCode,
        capacity: Number(capacity),
        room,
        status: 'ACTIVE',
      });
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'CREATE',
      entity: 'Section',
      entityId: section._id.toString(),
      newValues: section.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, section, 'Section created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateSection = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const section = await Section.findOne({ _id: id, schoolId });
    if (!section) {
      throw new NotFoundError('Section not found.');
    }

    const oldValues = section.toObject();

    if (req.body.capacity !== undefined && Number(req.body.capacity) < 0) {
      throw new ValidationError('Section capacity must be greater than or equal to 0.');
    }

    Object.assign(section, req.body);
    await section.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UPDATE',
      entity: 'Section',
      entityId: section._id.toString(),
      oldValues,
      newValues: section.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, section, 'Section updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteSection = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const section = await Section.findOne({ _id: id, schoolId });
    if (!section) {
      throw new NotFoundError('Section not found.');
    }

    const hasAssignments = await TeacherAssignment.countDocuments({ schoolId, sectionId: id, status: { $ne: 'ARCHIVED' } });

    if (hasAssignments > 0) {
      section.status = 'ARCHIVED';
      await section.save();

      await logAuditEvent({
        schoolId,
        actorId: req.user._id,
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'ARCHIVE',
        entity: 'Section',
        entityId: section._id.toString(),
        reason: 'Referenced by teacher assignments - archived for data preservation',
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return successResponse(res, null, 'Section archived successfully (referenced by teacher assignments)');
    }

    section.status = 'ARCHIVED';
    await section.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'ARCHIVE',
      entity: 'Section',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Section archived successfully');
  } catch (error) {
    next(error);
  }
};

const restoreSection = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const section = await Section.findOne({ _id: id, schoolId });
    if (!section) {
      throw new NotFoundError('Section not found.');
    }

    const oldValues = section.toObject();
    section.status = 'ACTIVE';
    await section.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'RESTORE',
      entity: 'Section',
      entityId: section._id.toString(),
      oldValues,
      newValues: section.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, section, 'Section restored successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSections,
  createSection,
  updateSection,
  deleteSection,
  restoreSection,
};
