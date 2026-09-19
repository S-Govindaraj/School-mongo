const ClassSubject = require('../models/ClassSubject');
const AcademicYear = require('../models/AcademicYear');
const Grade = require('../models/Grade');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getClassSubjects = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, gradeId, status, includeArchived } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }
    if (academicYearId) filter.academicYearId = academicYearId;
    if (gradeId) filter.gradeId = gradeId;

    const list = await ClassSubject.find(filter)
      .populate('gradeId')
      .populate('subjectId')
      .populate('academicYearId')
      .sort({ createdAt: -1 });

    return successResponse(res, list, 'Class subjects retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createClassSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const {
      academicYearId,
      gradeId,
      subjectId,
      isMandatory = true,
      weeklyPeriods = 5,
      passMarks = 35,
      maxMarks = 100,
    } = req.body;

    const existing = await ClassSubject.findOne({
      schoolId,
      academicYearId,
      gradeId,
      subjectId,
    });

    if (existing && existing.status !== 'ARCHIVED') {
      throw new ValidationError('This subject is already configured for the selected academic year and grade.');
    }

    let record;
    if (existing && existing.status === 'ARCHIVED') {
      existing.isMandatory = isMandatory;
      existing.weeklyPeriods = Number(weeklyPeriods);
      existing.passMarks = Number(passMarks);
      existing.maxMarks = Number(maxMarks);
      existing.status = 'ACTIVE';
      record = await existing.save();
    } else {
      record = await ClassSubject.create({
        schoolId,
        academicYearId,
        gradeId,
        subjectId,
        isMandatory: Boolean(isMandatory),
        weeklyPeriods: Number(weeklyPeriods),
        passMarks: Number(passMarks),
        maxMarks: Number(maxMarks),
        status: 'ACTIVE',
      });
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'CREATE',
      entity: 'ClassSubject',
      entityId: record._id.toString(),
      newValues: record.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, record, 'Class subject configured successfully', 201);
  } catch (error) {
    next(error);
  }
};

const saveBulkClassSubjects = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { items = [] } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('At least one class subject item is required.');
    }

    const createdRecords = [];
    for (const item of items) {
      const { academicYearId, gradeId, subjectId, isMandatory = true, weeklyPeriods = 5, passMarks = 35, maxMarks = 100 } = item;

      let record = await ClassSubject.findOne({ schoolId, academicYearId, gradeId, subjectId });
      if (!record) {
        record = await ClassSubject.create({
          schoolId,
          academicYearId,
          gradeId,
          subjectId,
          isMandatory: Boolean(isMandatory),
          weeklyPeriods: Number(weeklyPeriods),
          passMarks: Number(passMarks),
          maxMarks: Number(maxMarks),
          status: 'ACTIVE',
        });
      } else {
        record.isMandatory = Boolean(isMandatory);
        record.weeklyPeriods = Number(weeklyPeriods);
        record.passMarks = Number(passMarks);
        record.maxMarks = Number(maxMarks);
        record.status = 'ACTIVE';
        await record.save();
      }
      createdRecords.push(record);
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'BULK_CREATE',
      entity: 'ClassSubject',
      details: { count: createdRecords.length },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, createdRecords, 'Bulk class subjects saved successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateClassSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const record = await ClassSubject.findOne({ _id: id, schoolId });
    if (!record) {
      throw new NotFoundError('Class subject configuration not found.');
    }

    const oldValues = record.toObject();
    Object.assign(record, req.body);
    await record.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UPDATE',
      entity: 'ClassSubject',
      entityId: record._id.toString(),
      oldValues,
      newValues: record.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, record, 'Class subject updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteClassSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const record = await ClassSubject.findOne({ _id: id, schoolId });
    if (!record) {
      throw new NotFoundError('Class subject configuration not found.');
    }

    const hasAssignments = await TeacherAssignment.countDocuments({
      schoolId,
      academicYearId: record.academicYearId,
      gradeId: record.gradeId,
      subjectId: record.subjectId,
      status: { $ne: 'ARCHIVED' },
    });

    if (hasAssignments > 0) {
      record.status = 'ARCHIVED';
      await record.save();

      await logAuditEvent({
        schoolId,
        actorId: req.user._id,
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'ARCHIVE',
        entity: 'ClassSubject',
        entityId: record._id.toString(),
        reason: 'Referenced by active teacher assignments - archived for data preservation',
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return successResponse(res, null, 'Class subject archived (referenced by teacher assignments)');
    }

    record.status = 'ARCHIVED';
    await record.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'ARCHIVE',
      entity: 'ClassSubject',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Class subject archived successfully');
  } catch (error) {
    next(error);
  }
};

const restoreClassSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const record = await ClassSubject.findOne({ _id: id, schoolId });
    if (!record) {
      throw new NotFoundError('Class subject configuration not found.');
    }

    const oldValues = record.toObject();
    record.status = 'ACTIVE';
    await record.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'RESTORE',
      entity: 'ClassSubject',
      entityId: record._id.toString(),
      oldValues,
      newValues: record.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, record, 'Class subject restored successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getClassSubjects,
  createClassSubject,
  saveBulkClassSubjects,
  createBulkClassSubjects: saveBulkClassSubjects,
  updateClassSubject,
  deleteClassSubject,
  restoreClassSubject,
};
