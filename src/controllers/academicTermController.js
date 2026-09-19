const AcademicTerm = require('../models/AcademicTerm');
const AcademicYear = require('../models/AcademicYear');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getAcademicTerms = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, status, includeArchived } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }
    if (academicYearId) {
      filter.academicYearId = academicYearId;
    }

    const terms = await AcademicTerm.find(filter)
      .populate('academicYearId')
      .sort({ sequence: 1, startDate: 1 });

    return successResponse(res, terms, 'Academic terms retrieved');
  } catch (error) {
    next(error);
  }
};

const createAcademicTerm = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, name, code, sequence = 1, startDate, endDate, isCurrent } = req.body;

    const year = await AcademicYear.findOne({ _id: academicYearId, schoolId });
    if (!year) {
      throw new ValidationError('Selected academic year does not exist in this school.');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      throw new ValidationError('Term start date must be before end date.');
    }

    if (isCurrent) {
      await AcademicTerm.updateMany({ schoolId, academicYearId }, { isCurrent: false });
    }

    const term = await AcademicTerm.create({
      schoolId,
      academicYearId,
      name,
      code: String(code || '').trim(),
      sequence: Number(sequence),
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
      entity: 'AcademicTerm',
      entityId: term._id.toString(),
      newValues: term.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, term, 'Academic term created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateAcademicTerm = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const term = await AcademicTerm.findOne({ _id: id, schoolId });
    if (!term) {
      throw new NotFoundError('Academic term not found.');
    }

    const oldValues = term.toObject();

    if (req.body.isCurrent && !term.isCurrent) {
      await AcademicTerm.updateMany({ schoolId, academicYearId: term.academicYearId }, { isCurrent: false });
    }

    Object.assign(term, req.body);

    if (term.startDate >= term.endDate) {
      throw new ValidationError('Start date must be before end date.');
    }

    await term.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UPDATE',
      entity: 'AcademicTerm',
      entityId: term._id.toString(),
      oldValues,
      newValues: term.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, term, 'Academic term updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteAcademicTerm = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const term = await AcademicTerm.findOne({ _id: id, schoolId });
    if (!term) {
      throw new NotFoundError('Academic term not found.');
    }

    term.status = 'INACTIVE';
    term.isCurrent = false;
    await term.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'DEACTIVATE',
      entity: 'AcademicTerm',
      entityId: term._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Academic term deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restoreAcademicTerm = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const term = await AcademicTerm.findOne({ _id: id, schoolId });
    if (!term) {
      throw new NotFoundError('Academic term not found.');
    }

    term.status = 'ACTIVE';
    await term.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'ACTIVATE',
      entity: 'AcademicTerm',
      entityId: term._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, term, 'Academic term activated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAcademicTerms,
  createAcademicTerm,
  updateAcademicTerm,
  deleteAcademicTerm,
  restoreAcademicTerm,
};
