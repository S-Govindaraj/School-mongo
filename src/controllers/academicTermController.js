const AcademicTerm = require('../models/AcademicTerm');
const AcademicYear = require('../models/AcademicYear');
const AttendanceRecord = require('../models/AttendanceRecord');
const ExamResult = require('../models/ExamResult');
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
      .populate('academicYearId', 'name code startDate endDate isCurrent')
      .sort({ sequence: 1, startDate: 1 })
      .lean();

    return successResponse(res, terms, 'Academic terms retrieved');
  } catch (error) {
    next(error);
  }
};

const createAcademicTerm = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, name, code, sequence = 1, startDate, endDate, isCurrent, status: requestedStatus } = req.body;

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new ValidationError('Term name is required.');
    }
    const formattedCode = String(code || '').trim().toUpperCase();
    if (!formattedCode) {
      throw new ValidationError('Term code is required.');
    }

    const year = await AcademicYear.findOne({ _id: academicYearId, schoolId });
    if (!year) {
      throw new ValidationError('Selected academic year does not exist in this school.');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Term start date and end date must be valid dates.');
    }
    if (start >= end) {
      throw new ValidationError('Term start date must be before end date.');
    }

    // Business Rule: Term must belong completely inside the selected Academic Year
    if (start < new Date(year.startDate) || end > new Date(year.endDate)) {
      throw new ValidationError(
        `Term dates must be within the academic year (${year.code}) period (${new Date(year.startDate).toLocaleDateString()} to ${new Date(year.endDate).toLocaleDateString()}).`
      );
    }

    // Sequence must be positive integer
    const seqNum = Number(sequence);
    if (!Number.isInteger(seqNum) || seqNum <= 0) {
      throw new ValidationError('Term sequence must be a positive integer.');
    }

    // Run duplicate code, sequence, and overlap checks in parallel
    const [existingCode, existingSeq, overlappingTerm] = await Promise.all([
      AcademicTerm.findOne({ schoolId, academicYearId, code: formattedCode, status: { $ne: 'ARCHIVED' } }),
      AcademicTerm.findOne({ schoolId, academicYearId, sequence: seqNum, status: { $ne: 'ARCHIVED' } }),
      AcademicTerm.findOne({
        schoolId, academicYearId, status: { $ne: 'ARCHIVED' },
        $or: [
          { startDate: { $lte: start }, endDate: { $gte: start } },
          { startDate: { $lte: end }, endDate: { $gte: end } },
          { startDate: { $gte: start }, endDate: { $lte: end } },
        ],
      }),
    ]);
    if (existingCode) throw new ValidationError(`Term code '${formattedCode}' already exists in this academic year.`);
    if (existingSeq) throw new ValidationError(`Term sequence '${seqNum}' is already assigned to term '${existingSeq.name}'.`);
    if (overlappingTerm) throw new ValidationError(`Term dates overlap with existing term '${overlappingTerm.name}'.`);

    if (isCurrent) {
      await AcademicTerm.updateMany({ schoolId, academicYearId }, { isCurrent: false });
    }

    const status = (requestedStatus === 'ACTIVE' || isCurrent) ? 'ACTIVE' : 'INACTIVE';

    const term = await AcademicTerm.create({
      schoolId,
      academicYearId,
      name: trimmedName,
      code: formattedCode,
      sequence: seqNum,
      startDate: start,
      endDate: end,
      isCurrent: Boolean(isCurrent),
      status,
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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
    const academicYearId = req.body.academicYearId || term.academicYearId;

    const year = await AcademicYear.findOne({ _id: academicYearId, schoolId });
    if (!year) {
      throw new ValidationError('Selected academic year does not exist in this school.');
    }

    // Code duplicate check
    if (req.body.code && String(req.body.code).trim().toUpperCase() !== term.code) {
      const formattedCode = String(req.body.code).trim().toUpperCase();
      const existingCode = await AcademicTerm.findOne({
        _id: { $ne: id },
        schoolId,
        academicYearId,
        code: formattedCode,
        status: { $ne: 'ARCHIVED' },
      });
      if (existingCode) {
        throw new ValidationError(`Term code '${formattedCode}' already exists in this academic year.`);
      }
      term.code = formattedCode;
    }

    // Sequence duplicate check
    if (req.body.sequence !== undefined && Number(req.body.sequence) !== term.sequence) {
      const seqNum = Number(req.body.sequence);
      if (!Number.isInteger(seqNum) || seqNum <= 0) {
        throw new ValidationError('Term sequence must be a positive integer.');
      }
      const existingSeq = await AcademicTerm.findOne({
        _id: { $ne: id },
        schoolId,
        academicYearId,
        sequence: seqNum,
        status: { $ne: 'ARCHIVED' },
      });
      if (existingSeq) {
        throw new ValidationError(`Term sequence '${seqNum}' is already assigned to term '${existingSeq.name}'.`);
      }
      term.sequence = seqNum;
    }

    // Date validation
    const start = req.body.startDate ? new Date(req.body.startDate) : term.startDate;
    const end = req.body.endDate ? new Date(req.body.endDate) : term.endDate;
    if (start >= end) {
      throw new ValidationError('Term start date must be before end date.');
    }

    if (start < new Date(year.startDate) || end > new Date(year.endDate)) {
      throw new ValidationError(
        `Term dates must be within the academic year (${year.code}) period (${new Date(year.startDate).toLocaleDateString()} to ${new Date(year.endDate).toLocaleDateString()}).`
      );
    }

    // Overlap validation
    if (req.body.startDate || req.body.endDate) {
      const overlappingTerm = await AcademicTerm.findOne({
        _id: { $ne: id },
        schoolId,
        academicYearId,
        status: { $ne: 'ARCHIVED' },
        $or: [
          { startDate: { $lte: start }, endDate: { $gte: start } },
          { startDate: { $lte: end }, endDate: { $gte: end } },
          { startDate: { $gte: start }, endDate: { $lte: end } },
        ],
      });
      if (overlappingTerm) {
        throw new ValidationError(`Term dates overlap with existing term '${overlappingTerm.name}'.`);
      }
      term.startDate = start;
      term.endDate = end;
    }

    if (req.body.name) term.name = String(req.body.name).trim();
    if (req.body.status) term.status = req.body.status;

    if (req.body.isCurrent && !term.isCurrent) {
      await AcademicTerm.updateMany({ schoolId, academicYearId }, { isCurrent: false });
      term.isCurrent = true;
    }

    await term.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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

    // Check dependencies
    const [hasAttendance, hasExams] = await Promise.all([
      AttendanceRecord.countDocuments({ schoolId, termId: id }).catch(() => 0),
      ExamResult.countDocuments({ schoolId, termId: id }).catch(() => 0),
    ]);

    if (hasAttendance > 0 || hasExams > 0) {
      throw new ValidationError('This academic term cannot be deleted because related historical records exist.');
    }

    term.status = 'INACTIVE';
    term.isCurrent = false;
    await term.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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
