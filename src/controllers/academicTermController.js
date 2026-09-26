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

    const formattedTerms = terms.map((t) => ({ ...t, displayOrder: t.sequence }));

    return successResponse(res, formattedTerms, 'Academic terms retrieved');
  } catch (error) {
    next(error);
  }
};

const createAcademicTerm = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, name, code, startDate, endDate, isCurrent, status: requestedStatus } = req.body;
    const rawSeq = req.body.sequence !== undefined ? req.body.sequence : req.body.displayOrder;

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
      const yearStartStr = new Date(year.startDate).toISOString().split('T')[0];
      const yearEndStr = new Date(year.endDate).toISOString().split('T')[0];
      throw new ValidationError(
        `Term dates must be within the academic year (${year.code}) period (${yearStartStr} to ${yearEndStr}).`
      );
    }

    // Sequence / displayOrder resolution
    let seqNum = rawSeq !== undefined && rawSeq !== null && rawSeq !== '' ? Number(rawSeq) : null;
    if (seqNum === null || isNaN(seqNum)) {
      const highest = await AcademicTerm.findOne({ schoolId, academicYearId, status: { $ne: 'ARCHIVED' } })
        .sort({ sequence: -1 })
        .select('sequence')
        .lean();
      seqNum = highest ? highest.sequence + 1 : 1;
    }
    if (!Number.isInteger(seqNum) || seqNum <= 0) {
      throw new ValidationError('Term sequence must be a positive integer.');
    }

    // Fetch existing terms in the same academic year
    const existingTermsInYear = await AcademicTerm.find({
      schoolId,
      academicYearId,
      status: { $ne: 'ARCHIVED' },
    }).sort({ sequence: 1, startDate: 1 }).lean();

    // Check duplicate code
    const existingCode = existingTermsInYear.find((t) => t.code === formattedCode);
    if (existingCode) {
      throw new ValidationError(`Term code '${formattedCode}' already exists in this academic year.`);
    }

    // Check duplicate sequence
    const existingSeq = existingTermsInYear.find((t) => t.sequence === seqNum);
    if (existingSeq) {
      throw new ValidationError(`Term sequence '${seqNum}' is already assigned to term '${existingSeq.name}'.`);
    }

    // Chronological validation: Start date must be after previous term's end date in this academic year
    const prevTerm = existingTermsInYear
      .filter((t) => t.sequence < seqNum)
      .sort((a, b) => b.sequence - a.sequence)[0];
    if (prevTerm) {
      const prevEnd = new Date(prevTerm.endDate);
      if (start <= prevEnd) {
        const prevEndStr = prevEnd.toISOString().split('T')[0];
        const startStr = start.toISOString().split('T')[0];
        throw new ValidationError(
          `Term start date (${startStr}) must be after the previous term '${prevTerm.name}' end date (${prevEndStr}).`
        );
      }
    }

    // Chronological validation: End date must be before next term's start date in this academic year
    const nextTerm = existingTermsInYear
      .filter((t) => t.sequence > seqNum)
      .sort((a, b) => a.sequence - b.sequence)[0];
    if (nextTerm) {
      const nextStart = new Date(nextTerm.startDate);
      if (end >= nextStart) {
        const nextStartStr = nextStart.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        throw new ValidationError(
          `Term end date (${endStr}) must be before the next term '${nextTerm.name}' start date (${nextStartStr}).`
        );
      }
    }

    // Overlap validation
    const overlappingTerm = existingTermsInYear.find((t) => {
      const tStart = new Date(t.startDate);
      const tEnd = new Date(t.endDate);
      return (
        (tStart <= start && tEnd >= start) ||
        (tStart <= end && tEnd >= end) ||
        (tStart >= start && tEnd <= end)
      );
    });
    if (overlappingTerm) {
      throw new ValidationError(`Term dates overlap with existing term '${overlappingTerm.name}'.`);
    }

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

    const populatedTerm = await AcademicTerm.findById(term._id)
      .populate('academicYearId', 'name code startDate endDate isCurrent')
      .lean();

    return successResponse(
      res,
      { ...populatedTerm, displayOrder: populatedTerm.sequence },
      'Academic term created successfully',
      201
    );
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

    // Sequence / displayOrder
    const rawSeq = req.body.sequence !== undefined ? req.body.sequence : req.body.displayOrder;
    let targetSeq = term.sequence;
    if (rawSeq !== undefined && rawSeq !== null && rawSeq !== '') {
      const parsedSeq = Number(rawSeq);
      if (!Number.isInteger(parsedSeq) || parsedSeq <= 0) {
        throw new ValidationError('Term sequence must be a positive integer.');
      }
      targetSeq = parsedSeq;
    }

    // Code
    let targetCode = term.code;
    if (req.body.code) {
      const formattedCode = String(req.body.code).trim().toUpperCase();
      if (!formattedCode) {
        throw new ValidationError('Term code is required.');
      }
      targetCode = formattedCode;
    }

    // Date validation
    const start = req.body.startDate ? new Date(req.body.startDate) : new Date(term.startDate);
    const end = req.body.endDate ? new Date(req.body.endDate) : new Date(term.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Term start date and end date must be valid dates.');
    }
    if (start >= end) {
      throw new ValidationError('Term start date must be before end date.');
    }

    if (start < new Date(year.startDate) || end > new Date(year.endDate)) {
      const yearStartStr = new Date(year.startDate).toISOString().split('T')[0];
      const yearEndStr = new Date(year.endDate).toISOString().split('T')[0];
      throw new ValidationError(
        `Term dates must be within the academic year (${year.code}) period (${yearStartStr} to ${yearEndStr}).`
      );
    }

    // Fetch other non-archived terms in the same academic year
    const otherTerms = await AcademicTerm.find({
      _id: { $ne: id },
      schoolId,
      academicYearId,
      status: { $ne: 'ARCHIVED' },
    }).sort({ sequence: 1, startDate: 1 }).lean();

    // Check duplicate code
    if (targetCode !== term.code) {
      const existingCode = otherTerms.find((t) => t.code === targetCode);
      if (existingCode) {
        throw new ValidationError(`Term code '${targetCode}' already exists in this academic year.`);
      }
      term.code = targetCode;
    }

    // Check duplicate sequence
    if (targetSeq !== term.sequence) {
      const existingSeq = otherTerms.find((t) => t.sequence === targetSeq);
      if (existingSeq) {
        throw new ValidationError(`Term sequence '${targetSeq}' is already assigned to term '${existingSeq.name}'.`);
      }
      term.sequence = targetSeq;
    }

    // Chronological validation: Start date must be after previous term's end date in this academic year
    const prevTerm = otherTerms
      .filter((t) => t.sequence < targetSeq)
      .sort((a, b) => b.sequence - a.sequence)[0];
    if (prevTerm) {
      const prevEnd = new Date(prevTerm.endDate);
      if (start <= prevEnd) {
        const prevEndStr = prevEnd.toISOString().split('T')[0];
        const startStr = start.toISOString().split('T')[0];
        throw new ValidationError(
          `Term start date (${startStr}) must be after the previous term '${prevTerm.name}' end date (${prevEndStr}).`
        );
      }
    }

    // Chronological validation: End date must be before next term's start date in this academic year
    const nextTerm = otherTerms
      .filter((t) => t.sequence > targetSeq)
      .sort((a, b) => a.sequence - b.sequence)[0];
    if (nextTerm) {
      const nextStart = new Date(nextTerm.startDate);
      if (end >= nextStart) {
        const nextStartStr = nextStart.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        throw new ValidationError(
          `Term end date (${endStr}) must be before the next term '${nextTerm.name}' start date (${nextStartStr}).`
        );
      }
    }

    // Overlap validation
    const overlappingTerm = otherTerms.find((t) => {
      const tStart = new Date(t.startDate);
      const tEnd = new Date(t.endDate);
      return (
        (tStart <= start && tEnd >= start) ||
        (tStart <= end && tEnd >= end) ||
        (tStart >= start && tEnd <= end)
      );
    });
    if (overlappingTerm) {
      throw new ValidationError(`Term dates overlap with existing term '${overlappingTerm.name}'.`);
    }

    if (req.body.name) term.name = String(req.body.name).trim();
    term.startDate = start;
    term.endDate = end;
    if (req.body.academicYearId) term.academicYearId = req.body.academicYearId;
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

    const populatedTerm = await AcademicTerm.findById(term._id)
      .populate('academicYearId', 'name code startDate endDate isCurrent')
      .lean();

    return successResponse(
      res,
      { ...populatedTerm, displayOrder: populatedTerm.sequence },
      'Academic term updated successfully'
    );
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
      ExamResult.countDocuments({ schoolId, academicTermId: id }).catch(() => 0),
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
