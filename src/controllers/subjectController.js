const Subject = require('../models/Subject');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const Timetable = require('../models/Timetable');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getSubjects = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, includeArchived, type, search } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }
    if (type && type !== 'ALL') {
      filter.type = String(type).trim().toUpperCase();
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ name: regex }, { code: regex }, { shortName: regex }];
    }

    const subjects = await Subject.find(filter).sort({ name: 1 }).lean();
    return successResponse(res, subjects, 'Subjects retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code, shortName = '', type = 'CORE', description = '', status: requestedStatus } = req.body;

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new ValidationError('Subject name is required.');
    }

    const formattedCode = String(code || '').trim().toUpperCase();
    if (!formattedCode) {
      throw new ValidationError('Subject code is required.');
    }

    // Parallel duplicate checks
    const normalizedName = trimmedName.toLowerCase();
    const [existingCode, existingName] = await Promise.all([
      Subject.findOne({ schoolId, code: formattedCode, status: { $ne: 'ARCHIVED' } }).lean(),
      Subject.findOne({
        schoolId,
        $or: [{ normalizedName }, { name: new RegExp(`^${trimmedName}$`, 'i') }],
        status: { $ne: 'ARCHIVED' },
      }).lean(),
    ]);
    
    if (existingCode) {
      throw new ValidationError(`Subject code '${formattedCode}' already exists in this school.`);
    }
    if (existingName) {
      throw new ValidationError(`Subject '${existingName.name}' already exists in this school.`);
    }

    const status = requestedStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';

    const subject = await Subject.create({
      schoolId,
      name: trimmedName,
      normalizedName,
      code: formattedCode,
      shortName: String(shortName || '').trim(),
      type,
      description: String(description || '').trim(),
      status,
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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

    if (req.body.code && String(req.body.code).trim().toUpperCase() !== subject.code) {
      const formattedCode = String(req.body.code).trim().toUpperCase();
      const existing = await Subject.findOne({
        _id: { $ne: id },
        schoolId,
        code: formattedCode,
        status: { $ne: 'ARCHIVED' },
      });
      if (existing) {
        throw new ValidationError(`Subject code '${formattedCode}' already exists in this school.`);
      }
      subject.code = formattedCode;
    }

    if (req.body.name && String(req.body.name).trim().toLowerCase() !== (subject.normalizedName || subject.name.toLowerCase())) {
      const trimmedName = String(req.body.name).trim();
      const existing = await Subject.findOne({
        _id: { $ne: id },
        schoolId,
        $or: [{ normalizedName: trimmedName.toLowerCase() }, { name: new RegExp(`^${trimmedName}$`, 'i') }],
        status: { $ne: 'ARCHIVED' },
      });
      if (existing) {
        throw new ValidationError(`Subject '${existing.name}' already exists in this school.`);
      }
      subject.name = trimmedName;
      subject.normalizedName = trimmedName.toLowerCase();
    }

    if (req.body.shortName !== undefined) subject.shortName = String(req.body.shortName || '').trim();
    if (req.body.type) subject.type = req.body.type;
    if (req.body.description !== undefined) subject.description = String(req.body.description || '').trim();
    if (req.body.status) subject.status = req.body.status;

    await subject.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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

    const [hasClassSubjects, hasAssignments, hasTimetable] = await Promise.all([
      ClassSubject.countDocuments({ schoolId, subjectId: id, status: { $ne: 'ARCHIVED' } }),
      TeacherAssignment.countDocuments({ schoolId, subjectId: id, status: { $ne: 'ARCHIVED' } }),
      Timetable.countDocuments({ schoolId, subjectId: id, status: { $ne: 'ARCHIVED' } }),
    ]);

    if (hasClassSubjects > 0 || hasAssignments > 0 || hasTimetable > 0) {
      throw new ValidationError('This subject cannot be deleted because related class configurations or timetable entries exist.');
    }

    subject.status = 'INACTIVE';
    await subject.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'Subject',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Subject deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restoreSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const subject = await Subject.findOne({ _id: id, schoolId });
    if (!subject) {
      throw new NotFoundError('Subject not found.');
    }

    subject.status = 'ACTIVE';
    await subject.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'Subject',
      entityId: subject._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, subject, 'Subject activated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  restoreSubject,
};
