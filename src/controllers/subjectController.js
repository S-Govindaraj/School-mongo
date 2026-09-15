const Subject = require('../models/Subject');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getSubjects = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const subjects = await Subject.find({
      schoolId,
      status: { $ne: 'ARCHIVED' },
    }).sort({ name: 1 });

    return successResponse(res, subjects, 'Subjects retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code, shortName = '', type = 'CORE', description = '' } = req.body;

    const formattedCode = String(code || '').trim().toUpperCase();

    const existing = await Subject.findOne({ schoolId, code: formattedCode });
    if (existing && existing.status !== 'ARCHIVED') {
      throw new ValidationError(`Subject code '${formattedCode}' already exists in this school.`);
    }

    let subject;
    if (existing && existing.status === 'ARCHIVED') {
      existing.name = name;
      existing.shortName = shortName;
      existing.type = type;
      existing.description = description;
      existing.status = 'ACTIVE';
      subject = await existing.save();
    } else {
      subject = await Subject.create({
        schoolId,
        name,
        code: formattedCode,
        shortName,
        type,
        description,
        status: 'ACTIVE',
      });
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'CREATE',
      entity: 'Subject',
      entityId: subject._id.toString(),
      newValues: subject.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, subject, 'Subject created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const subject = await Subject.findOne({ _id: id, schoolId });
    if (!subject) {
      throw new NotFoundError('Subject not found.');
    }

    const oldValues = subject.toObject();
    Object.assign(subject, req.body);
    await subject.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UPDATE',
      entity: 'Subject',
      entityId: subject._id.toString(),
      oldValues,
      newValues: subject.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, subject, 'Subject updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const subject = await Subject.findOne({ _id: id, schoolId });
    if (!subject) {
      throw new NotFoundError('Subject not found.');
    }

    const hasClassSubjects = await ClassSubject.countDocuments({ schoolId, subjectId: id, status: { $ne: 'ARCHIVED' } });
    const hasAssignments = await TeacherAssignment.countDocuments({ schoolId, subjectId: id, status: { $ne: 'ARCHIVED' } });

    if (hasClassSubjects > 0 || hasAssignments > 0) {
      subject.status = 'ARCHIVED';
      await subject.save();

      await logAuditEvent({
        schoolId,
        actorId: req.user._id,
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'ARCHIVE',
        entity: 'Subject',
        entityId: subject._id.toString(),
        reason: 'Referenced by class subjects or teacher assignments - archived for data preservation',
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return successResponse(res, null, 'Subject archived successfully (referenced by class configurations)');
    }

    subject.status = 'ARCHIVED';
    await subject.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'ARCHIVE',
      entity: 'Subject',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Subject archived successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
};
