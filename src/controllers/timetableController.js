const Timetable = require('../models/Timetable');
const AcademicYear = require('../models/AcademicYear');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { TimetableValidatorService } = require('../services/timetableValidatorService');
const { TimetableLockService } = require('../services/timetableLockService');
const { TimetablePublishService } = require('../services/timetablePublishService');
const { TimetableBulkService } = require('../services/timetableBulkService');

// Thin wrapper kept for the existing create/update call sites below — now
// backed by the same TimetableValidatorService.validateSlot() the Smart
// Timetable Generator and the /timetables/validate endpoint use, so manual
// edits and automatic generation can never disagree on what a conflict is.
const validateTimetableRelationsAndConflicts = async (schoolId, data, currentId = null) => {
  const ctx = await TimetableValidatorService.buildScopedContext(schoolId, data, currentId);
  const { valid, conflicts } = TimetableValidatorService.validateSlot(
    { ...data, excludeTimetableId: currentId },
    ctx,
    { hardOnly: true }
  );
  if (!valid) {
    const first = conflicts.find((c) => c.severity === 'HARD') || conflicts[0];
    throw new ValidationError(first.message, conflicts);
  }
};

const validateSlotPreview = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const ctx = await TimetableValidatorService.buildScopedContext(schoolId, req.body, req.body.excludeTimetableId || null);
    const result = TimetableValidatorService.validateSlot(
      { ...req.body, excludeTimetableId: req.body.excludeTimetableId || null },
      ctx,
      { hardOnly: false, constraints: req.body.constraints || {} }
    );
    return successResponse(res, result, result.valid ? 'No conflicts found' : 'Conflicts found');
  } catch (error) {
    next(error);
  }
};

const getTimetables = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, gradeId, sectionId, teacherId, dayOfWeek } = req.query;

    const query = { schoolId, status: { $ne: 'ARCHIVED' } };
    if (academicYearId) query.academicYearId = academicYearId;
    if (gradeId) query.gradeId = gradeId;
    if (sectionId) query.sectionId = sectionId;
    if (teacherId) query.teacherId = teacherId;
    if (dayOfWeek) query.dayOfWeek = dayOfWeek;

    const entries = await Timetable.find(query)
      .populate('academicYearId', 'name code isCurrent')
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code room')
      .populate('periodId', 'name code sequence startTime endTime isBreak')
      .populate('subjectId', 'name code shortName subjectType')
      .populate('teacherId', 'firstName lastName employeeId designation email')
      .sort({ dayOfWeek: 1, 'periodId.sequence': 1 })
      .lean();

    const formatted = entries.map((e) => ({ ...e, id: String(e._id) }));
    return successResponse(res, formatted, 'Timetable entries retrieved');
  } catch (error) {
    next(error);
  }
};

const getSectionTimetable = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { sectionId } = req.params;
    const { academicYearId } = req.query;

    let targetAY = academicYearId;
    if (!targetAY) {
      const activeAY = await AcademicYear.findOne({ schoolId, isCurrent: true, status: 'ACTIVE' });
      targetAY = activeAY?._id;
    }

    const entries = await Timetable.find({
      schoolId,
      sectionId,
      academicYearId: targetAY,
      status: { $ne: 'ARCHIVED' },
    })
      .populate('periodId', 'name code sequence startTime endTime isBreak')
      .populate('subjectId', 'name code shortName')
      .populate('teacherId', 'firstName lastName employeeId')
      .lean();

    const formatted = entries.map((e) => ({ ...e, id: String(e._id) }));
    return successResponse(res, formatted, 'Section timetable retrieved');
  } catch (error) {
    next(error);
  }
};

const getTeacherTimetable = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { teacherId } = req.params;
    const { academicYearId } = req.query;

    let targetAY = academicYearId;
    if (!targetAY) {
      const activeAY = await AcademicYear.findOne({ schoolId, isCurrent: true, status: 'ACTIVE' });
      targetAY = activeAY?._id;
    }

    const entries = await Timetable.find({
      schoolId,
      teacherId,
      academicYearId: targetAY,
      status: { $ne: 'ARCHIVED' },
    })
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code room')
      .populate('periodId', 'name code sequence startTime endTime isBreak')
      .populate('subjectId', 'name code shortName')
      .lean();

    const formatted = entries.map((e) => ({ ...e, id: String(e._id) }));
    return successResponse(res, formatted, 'Teacher timetable retrieved');
  } catch (error) {
    next(error);
  }
};

const createTimetableEntry = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    await validateTimetableRelationsAndConflicts(schoolId, req.body);

    const {
      academicYearId,
      gradeId,
      sectionId,
      dayOfWeek,
      periodId,
      subjectId,
      teacherId,
      roomNumber,
      roomId,
      status = 'INACTIVE',
    } = req.body;

    const entry = await Timetable.create({
      schoolId,
      academicYearId,
      gradeId,
      sectionId,
      dayOfWeek,
      periodId,
      subjectId,
      teacherId,
      roomNumber: String(roomNumber || '').trim(),
      roomId: roomId || undefined,
      source: 'MANUAL',
      status,
    });

    const populated = await Timetable.findById(entry._id)
      .populate('academicYearId', 'name code')
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code room')
      .populate('periodId', 'name code sequence startTime endTime')
      .populate('subjectId', 'name code shortName')
      .populate('teacherId', 'firstName lastName employeeId')
      .populate('roomId', 'name capacity isLab');

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'CREATE',
      entity: 'Timetable',
      entityId: entry._id.toString(),
      newValues: entry.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, populated, 'Timetable entry created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateTimetableEntry = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const entry = await Timetable.findOne({ _id: id, schoolId });
    if (!entry) throw new NotFoundError('Timetable entry not found');
    if (entry.isLocked) throw new ValidationError('This timetable slot is locked and cannot be edited.');

    const oldValues = entry.toObject();
    const merged = { ...entry.toObject(), ...req.body };
    await validateTimetableRelationsAndConflicts(schoolId, merged, id);

    Object.assign(entry, req.body);
    if (
      (oldValues.source === 'AUTO_GENERATED' || oldValues.source === 'AUTO_GENERATED_THEN_EDITED') &&
      Object.keys(req.body).some((k) => k !== 'status')
    ) {
      entry.source = 'AUTO_GENERATED_THEN_EDITED';
    }
    await entry.save();

    const populated = await Timetable.findById(entry._id)
      .populate('academicYearId', 'name code')
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code room')
      .populate('periodId', 'name code sequence startTime endTime')
      .populate('subjectId', 'name code shortName')
      .populate('teacherId', 'firstName lastName employeeId')
      .populate('roomId', 'name capacity isLab');

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'UPDATE',
      entity: 'Timetable',
      entityId: entry._id.toString(),
      oldValues,
      newValues: entry.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, populated, 'Timetable entry updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteTimetableEntry = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const entry = await Timetable.findOne({ _id: id, schoolId });
    if (!entry) throw new NotFoundError('Timetable entry not found');
    if (entry.isLocked) throw new ValidationError('This timetable slot is locked and cannot be removed.');

    entry.status = 'ARCHIVED';
    await entry.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ARCHIVE',
      entity: 'Timetable',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Timetable entry archived successfully');
  } catch (error) {
    next(error);
  }
};

const lockTimetableEntry = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const entry = await TimetableLockService.lock(schoolId, req.params.id, req.user);
    return successResponse(res, entry, 'Timetable slot locked successfully');
  } catch (error) {
    next(error);
  }
};

const unlockTimetableEntry = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const entry = await TimetableLockService.unlock(schoolId, req.params.id, req.user);
    return successResponse(res, entry, 'Timetable slot unlocked successfully');
  } catch (error) {
    next(error);
  }
};

const publishTimetables = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const result = await TimetablePublishService.publish(schoolId, req.body, req.user);
    return successResponse(res, result, 'Timetable published successfully');
  } catch (error) {
    next(error);
  }
};

const bulkUpdateTimetables = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const count = await TimetableBulkService.applyBulkUpdate(schoolId, req.body.updates, req.user);
    return successResponse(res, { count }, 'Timetable entries updated successfully');
  } catch (error) {
    next(error);
  }
};

const swapTimetableEntries = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const count = await TimetableBulkService.swap(schoolId, req.body.timetableIdA, req.body.timetableIdB, req.user);
    return successResponse(res, { count }, 'Timetable slots swapped successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTimetables,
  getSectionTimetable,
  getTeacherTimetable,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  validateSlotPreview,
  lockTimetableEntry,
  unlockTimetableEntry,
  publishTimetables,
  bulkUpdateTimetables,
  swapTimetableEntries,
};
