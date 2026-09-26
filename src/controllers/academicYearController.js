const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const Enrollment = require('../models/Enrollment');
const Timetable = require('../models/Timetable');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceSession = require('../models/AttendanceSession');
const FeeStructure = require('../models/FeeStructure');
const ExamResult = require('../models/ExamResult');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { withTransactionOrFallback } = require('../utils/withTransaction');

// Helper to normalize input like "2026 - 2027" or "2026-2027" to "2026-2027"
const parseAndNormalizeYear = (rawYear) => {
  const cy = new Date().getFullYear();
  if (!rawYear || typeof rawYear !== 'string') {
    throw new ValidationError(`Enter a valid academic year such as ${cy} - ${cy + 1}.`);
  }
  const trimmed = rawYear.trim();
  const match = trimmed.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (!match) {
    throw new ValidationError(`Enter a valid academic year such as ${cy} - ${cy + 1}.`);
  }
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  if (end !== start + 1) {
    throw new ValidationError('The ending year must be exactly one year after the starting year.');
  }
  return {
    canonical: `${match[1]}-${match[2]}`,
    display: `${match[1]} - ${match[2]}`,
    startYear: start,
    endYear: end,
  };
};


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

    const years = await AcademicYear.find(filter)
      .sort({ startDate: -1 })
      .populate({
        path: 'terms',
        select: '_id name code status',
        options: {
          sort: { sequence: 1 },
        },
      })
      .lean();

    const result = years.map((year) => ({
      ...year,
      terms: year.terms || [],
      termCount: year.terms?.length || 0,
    }));

    return successResponse(
      res,
      result,
      'Academic years retrieved'
    );
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
    const { name, code, startDate, endDate, isCurrent, status: requestedStatus } = req.body;

    // Normalization & business rule validation
    const normalized = parseAndNormalizeYear(code || name);

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Start date and end date must be valid dates.');
    }
    if (start >= end) {
      throw new ValidationError('End date must be after the start date.');
    }

    // Parallel duplicate + overlap checks
    const [existing, overlapping] = await Promise.all([
      AcademicYear.findOne({
        schoolId,
        $or: [{ code: normalized.canonical }, { name: normalized.canonical }, { name: normalized.display }],
        status: { $ne: 'ARCHIVED' },
      }).lean(),
      AcademicYear.findOne({
        schoolId,
        status: { $ne: 'ARCHIVED' },
        $or: [
          { startDate: { $lte: start }, endDate: { $gte: start } },
          { startDate: { $lte: end }, endDate: { $gte: end } },
          { startDate: { $gte: start }, endDate: { $lte: end } },
        ],
      }).lean(),
    ]);
    
    if (existing) {
      throw new ValidationError(`Academic year ${normalized.display} already exists.`);
    }
    if (overlapping) {
      throw new ValidationError(`Academic year dates overlap with existing academic year '${overlapping.code}'.`);
    }

    // Critical Business Rule: Default status is INACTIVE unless isCurrent / Set as Active explicitly selected
    const shouldBeActive = Boolean(isCurrent) || requestedStatus === 'ACTIVE';
    const status = shouldBeActive ? 'ACTIVE' : 'INACTIVE';
    const finalIsCurrent = shouldBeActive;

    const year = await withTransactionOrFallback(async (session) => {
      const opts = session ? { session } : {};
      if (finalIsCurrent) {
        // Atomically deactivate previous active academic year
        await AcademicYear.updateMany(
          { schoolId, isCurrent: true },
          { $set: { isCurrent: false, status: 'INACTIVE' } },
          opts
        );
      }

      const [newYear] = await AcademicYear.create(
        [
          {
            schoolId,
            name: normalized.canonical,
            code: normalized.canonical,
            startDate: start,
            endDate: end,
            isCurrent: finalIsCurrent,
            status,
          },
        ],
        opts
      );

      return newYear;
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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

    // If attempting to edit code or name, check if historical dependent records exist
    if (req.body.code || req.body.name) {
      const targetCode = req.body.code || req.body.name;
      const normalized = parseAndNormalizeYear(targetCode);

      if (normalized.canonical !== year.code) {
        const [hasTerms, hasClassSubjects, hasAssignments, hasEnrollments] = await Promise.all([
          AcademicTerm.countDocuments({ schoolId, academicYearId: id }),
          ClassSubject.countDocuments({ schoolId, academicYearId: id }),
          TeacherAssignment.countDocuments({ schoolId, academicYearId: id }),
          Enrollment.countDocuments({ schoolId, academicYearId: id }),
        ]);

        if (hasTerms > 0 || hasClassSubjects > 0 || hasAssignments > 0 || hasEnrollments > 0) {
          throw new ValidationError(
            'Cannot change academic year identifier because dependent historical records already exist.'
          );
        }

        // Check duplicate
        const duplicate = await AcademicYear.findOne({
          _id: { $ne: id },
          schoolId,
          code: normalized.canonical,
          status: { $ne: 'ARCHIVED' },
        });
        if (duplicate) {
          throw new ValidationError(`Academic year ${normalized.display} already exists.`);
        }

        year.code = normalized.canonical;
        year.name = normalized.canonical;
      }
    }

    // Dates check
    const start = req.body.startDate ? new Date(req.body.startDate) : year.startDate;
    const end = req.body.endDate ? new Date(req.body.endDate) : year.endDate;
    if (start >= end) {
      throw new ValidationError('End date must be after the start date.');
    }

    // Check dependent terms are within updated dates
    if (req.body.startDate || req.body.endDate) {
      const outOfBoundTerm = await AcademicTerm.findOne({
        schoolId,
        academicYearId: id,
        status: { $ne: 'ARCHIVED' },
        $or: [{ startDate: { $lt: start } }, { endDate: { $gt: end } }],
      });
      if (outOfBoundTerm) {
        throw new ValidationError(
          `Cannot update dates: Academic term '${outOfBoundTerm.name}' falls outside the new date range.`
        );
      }
      year.startDate = start;
      year.endDate = end;
    }

    // Single active year rule when setting active
    const willBeCurrent = req.body.isCurrent !== undefined ? Boolean(req.body.isCurrent) : year.isCurrent;
    const willBeActive = req.body.status ? req.body.status === 'ACTIVE' : year.status === 'ACTIVE';

    if ((willBeCurrent && !year.isCurrent) || (willBeActive && year.status !== 'ACTIVE' && req.body.isCurrent)) {
      await withTransactionOrFallback(async (session) => {
        const opts = session ? { session } : {};
        await AcademicYear.updateMany(
          { schoolId, _id: { $ne: id }, isCurrent: true },
          { $set: { isCurrent: false, status: 'INACTIVE' } },
          opts
        );
        year.isCurrent = true;
        year.status = 'ACTIVE';
        await year.save(opts);
      });
    } else if (req.body.status === 'INACTIVE' && year.isCurrent && !req.body.replacementAcademicYearId) {
      // Deactivation check: prevent turning active year inactive if no replacement
      const otherActive = await AcademicYear.findOne({ schoolId, _id: { $ne: id }, status: 'ACTIVE' });
      if (!otherActive) {
        throw new ValidationError(
          'Please select another academic year before deactivating the current active academic year.'
        );
      }
      year.status = 'INACTIVE';
      year.isCurrent = false;
      await year.save();
    } else {
      if (req.body.status) year.status = req.body.status;
      await year.save();
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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

    await withTransactionOrFallback(async (session) => {
      const opts = session ? { session } : {};
      await AcademicYear.updateMany(
        { schoolId, _id: { $ne: id } },
        { $set: { isCurrent: false, status: 'INACTIVE' } },
        opts
      );
      year.isCurrent = true;
      year.status = 'ACTIVE';
      await year.save(opts);
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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

    // Check all dependent historical records
    const [
      termCount,
      classSubjectCount,
      teacherAssignmentCount,
      enrollmentCount,
      timetableCount,
      attendanceRecordCount,
      attendanceSessionCount,
      feeStructureCount,
      examResultCount,
    ] = await Promise.all([
      AcademicTerm.countDocuments({ schoolId, academicYearId: id }),
      ClassSubject.countDocuments({ schoolId, academicYearId: id }),
      TeacherAssignment.countDocuments({ schoolId, academicYearId: id }),
      Enrollment.countDocuments({ schoolId, academicYearId: id }),
      Timetable.countDocuments({ schoolId, academicYearId: id }),
      AttendanceRecord.countDocuments({ schoolId, academicYearId: id }),
      AttendanceSession.countDocuments({ schoolId, academicYearId: id }),
      FeeStructure.countDocuments({ schoolId, academicYearId: id }),
      ExamResult.countDocuments({ schoolId, academicYearId: id }),
    ]);

    const totalDependencies =
      termCount +
      classSubjectCount +
      teacherAssignmentCount +
      enrollmentCount +
      timetableCount +
      attendanceRecordCount +
      attendanceSessionCount +
      feeStructureCount +
      examResultCount;

    if (totalDependencies > 0) {
      throw new ValidationError('This academic year cannot be deleted because related records exist.');
    }

    // If active, prevent deleting the single active year
    if (year.isCurrent) {
      throw new ValidationError(
        'Please select another academic year before deleting or deactivating the current active academic year.'
      );
    }

    year.status = 'INACTIVE';
    year.isCurrent = false;
    await year.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'AcademicYear',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Academic year deactivated successfully');
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

    // Activating a year makes it the active year atomically
    await withTransactionOrFallback(async (session) => {
      const opts = session ? { session } : {};
      await AcademicYear.updateMany(
        { schoolId, _id: { $ne: id } },
        { $set: { isCurrent: false, status: 'INACTIVE' } },
        opts
      );
      year.status = 'ACTIVE';
      year.isCurrent = true;
      await year.save(opts);
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'AcademicYear',
      entityId: year._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, year, 'Academic year activated successfully');
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
