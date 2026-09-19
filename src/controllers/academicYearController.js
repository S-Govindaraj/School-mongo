const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getAcademicYears = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, includeArchived } = req.query;

    const filter = { schoolId };

    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }
    // Default: includes ALL (ACTIVE, INACTIVE, and ARCHIVED) so management table can view full lifecycle

    const years = await AcademicYear.find(filter).sort({ startDate: -1 });

    return successResponse(res, years, 'Academic years retrieved');
  } catch (error) {
    next(error);
  }
};

const getCurrentAcademicYear = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    let current = await AcademicYear.findOne({ schoolId, isCurrent: true, status: 'ACTIVE' });
    if (!current) {
      current = await AcademicYear.findOne({ schoolId, status: 'ACTIVE' }).sort({ startDate: -1 });
    }

    return successResponse(res, current, 'Current academic year retrieved');
  } catch (error) {
    next(error);
  }
};

const createAcademicYear = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code, startDate, endDate, isCurrent } = req.body;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      throw new ValidationError('Start date must be before end date.');
    }

    const trimmedCode = String(code || '').trim();
    const existing = await AcademicYear.findOne({
      schoolId,
      code: trimmedCode,
      status: { $ne: 'ARCHIVED' },
    });
    if (existing) {
      throw new ValidationError(`Academic year with code "${trimmedCode}" already exists in this school.`);
    }

    if (isCurrent) {
      await AcademicYear.updateMany({ schoolId }, { isCurrent: false });
    }

    const year = await AcademicYear.create({
      schoolId,
      name,
      code: String(code || '').trim(),
      startDate: start,
      endDate: end,
      isCurrent: Boolean(isCurrent),
      status: 'ACTIVE',
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'CREATE',
      entity: 'AcademicYear',
      entityId: year._id.toString(),
      newValues: year.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, year, 'Academic year created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateAcademicYear = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const year = await AcademicYear.findOne({ _id: id, schoolId });
    if (!year) {
      throw new NotFoundError('Academic year not found.');
    }

    const oldValues = year.toObject();

    if (req.body.isCurrent && !year.isCurrent) {
      await AcademicYear.updateMany({ schoolId }, { isCurrent: false });
    }

    if (req.body.code && String(req.body.code).trim() !== year.code) {
      const trimmedCode = String(req.body.code).trim();
      const existing = await AcademicYear.findOne({
        _id: { $ne: id },
        schoolId,
        code: trimmedCode,
        status: { $ne: 'ARCHIVED' },
      });
      if (existing) {
        throw new ValidationError(`Academic year with code "${trimmedCode}" already exists in this school.`);
      }
    }

    Object.assign(year, req.body);

    if (year.startDate >= year.endDate) {
      throw new ValidationError('Start date must be before end date.');
    }

    await year.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UPDATE',
      entity: 'AcademicYear',
      entityId: year._id.toString(),
      oldValues,
      newValues: year.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, year, 'Academic year updated successfully');
  } catch (error) {
    next(error);
  }
};

const setCurrentAcademicYear = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const year = await AcademicYear.findOne({ _id: id, schoolId });
    if (!year) {
      throw new NotFoundError('Academic year not found.');
    }

    await AcademicYear.updateMany({ schoolId }, { isCurrent: false });

    year.isCurrent = true;
    year.status = 'ACTIVE';
    await year.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'SET_CURRENT',
      entity: 'AcademicYear',
      entityId: year._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, year, 'Current academic year updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteAcademicYear = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const year = await AcademicYear.findOne({ _id: id, schoolId });
    if (!year) {
      throw new NotFoundError('Academic year not found.');
    }

    // Check historical dependencies
    const hasTerms = await AcademicTerm.countDocuments({ schoolId, academicYearId: id });
    const hasClassSubjects = await ClassSubject.countDocuments({ schoolId, academicYearId: id });
    const hasTeacherAssignments = await TeacherAssignment.countDocuments({ schoolId, academicYearId: id });

    if (hasTerms > 0 || hasClassSubjects > 0 || hasTeacherAssignments > 0) {
      // Historical preservation requirement: archive instead of hard delete
      year.status = 'ARCHIVED';
      year.isCurrent = false;
      await year.save();

      await logAuditEvent({
        schoolId,
        actorId: req.user._id,
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'ARCHIVE',
        entity: 'AcademicYear',
        entityId: year._id.toString(),
        reason: 'Referenced by historical records - archived for data preservation',
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return successResponse(res, null, 'Academic year archived (referenced by historical records)');
    }

    year.status = 'ARCHIVED';
    year.isCurrent = false;
    await year.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'ARCHIVE',
      entity: 'AcademicYear',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Academic year archived successfully');
  } catch (error) {
    next(error);
  }
};

const restoreAcademicYear = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const year = await AcademicYear.findOne({ _id: id, schoolId });
    if (!year) {
      throw new NotFoundError('Academic year not found.');
    }

    year.status = 'INACTIVE';
    await year.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'RESTORE',
      entity: 'AcademicYear',
      entityId: year._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, year, 'Academic year restored successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAcademicYears,
  getCurrentAcademicYear,
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
  deleteAcademicYear,
  restoreAcademicYear,
};
