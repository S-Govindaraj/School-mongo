const Section = require('../models/Section');
const Grade = require('../models/Grade');
const Room = require('../models/Room');
const TeacherAssignment = require('../models/TeacherAssignment');
const Enrollment = require('../models/Enrollment');
const Timetable = require('../models/Timetable');
const AttendanceRecord = require('../models/AttendanceRecord');
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
      .populate('gradeId', 'name code category')
      .populate('roomId', 'name capacity isLab')
      .sort({ code: 1, name: 1 })
      .lean();

    return successResponse(res, sections, 'Sections retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/** Resolves a submitted `roomId` against the school's actual Room master and
 * returns the {roomId, room} pair to persist — `room` (the legacy display
 * string) is always kept in sync with the real room's name, never freely
 * typed, so every place that still renders `section.room` shows real data. */
const resolveRoomSelection = async (schoolId, roomId) => {
  if (!roomId) return { roomId: undefined, room: '' };
  const room = await Room.findOne({ _id: roomId, schoolId, status: 'ACTIVE' }).lean();
  if (!room) {
    throw new ValidationError('Selected room does not exist or is not an active room for this school.');
  }
  return { roomId: room._id, room: room.name };
};

const createSection = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { gradeId, name, code, capacity = 40, roomId: requestedRoomId, status: requestedStatus } = req.body;

    const grade = await Grade.findOne({ _id: gradeId, schoolId });
    if (!grade) {
      throw new ValidationError('Selected grade does not exist in this school.');
    }

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new ValidationError('Section name is required.');
    }

    const formattedCode = String(code || '').trim().toUpperCase();
    if (!formattedCode) {
      throw new ValidationError('Section code is required.');
    }

    const capNum = Number(capacity);
    if (!Number.isInteger(capNum) || capNum <= 0) {
      throw new ValidationError('Section capacity must be a positive integer greater than 0.');
    }

    // Uniqueness within grade: code
    const existingCode = await Section.findOne({ schoolId, gradeId, code: formattedCode, status: { $ne: 'ARCHIVED' } });
    if (existingCode) {
      throw new ValidationError(`Section code '${formattedCode}' already exists in this grade.`);
    }

    // Uniqueness within grade: name
    const existingName = await Section.findOne({ schoolId, gradeId, name: trimmedName, status: { $ne: 'ARCHIVED' } });
    if (existingName) {
      throw new ValidationError(`Section '${trimmedName}' already exists in this grade.`);
    }

    const status = requestedStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
    const { roomId, room } = await resolveRoomSelection(schoolId, requestedRoomId);

    const section = await Section.create({
      schoolId,
      gradeId,
      name: trimmedName,
      code: formattedCode,
      capacity: capNum,
      roomId,
      room,
      status,
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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
    const gradeId = req.body.gradeId || section.gradeId;

    if (req.body.capacity !== undefined) {
      const capNum = Number(req.body.capacity);
      if (!Number.isInteger(capNum) || capNum <= 0) {
        throw new ValidationError('Section capacity must be a positive integer greater than 0.');
      }

      // Check current active enrollment
      const activeEnrollments = await Enrollment.countDocuments({
        schoolId,
        sectionId: id,
        status: { $in: ['ENROLLED', 'ACTIVE'] },
      });
      if (capNum < activeEnrollments) {
        throw new ValidationError(
          `Cannot reduce capacity to ${capNum} because this section already has ${activeEnrollments} active enrolled students.`
        );
      }
      section.capacity = capNum;
    }

    if (req.body.code && String(req.body.code).trim().toUpperCase() !== section.code) {
      const formattedCode = String(req.body.code).trim().toUpperCase();
      const existing = await Section.findOne({
        _id: { $ne: id },
        schoolId,
        gradeId,
        code: formattedCode,
        status: { $ne: 'ARCHIVED' },
      });
      if (existing) {
        throw new ValidationError(`Section code '${formattedCode}' already exists in this grade.`);
      }
      section.code = formattedCode;
    }

    if (req.body.name && String(req.body.name).trim() !== section.name) {
      const trimmedName = String(req.body.name).trim();
      const existing = await Section.findOne({
        _id: { $ne: id },
        schoolId,
        gradeId,
        name: trimmedName,
        status: { $ne: 'ARCHIVED' },
      });
      if (existing) {
        throw new ValidationError(`Section '${trimmedName}' already exists in this grade.`);
      }
      section.name = trimmedName;
    }

    if (req.body.roomId !== undefined) {
      const { roomId, room } = await resolveRoomSelection(schoolId, req.body.roomId);
      section.roomId = roomId;
      section.room = room;
    }
    if (req.body.status) section.status = req.body.status;

    await section.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
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

    const [hasAssignments, hasEnrollments, hasTimetable, hasAttendance] = await Promise.all([
      TeacherAssignment.countDocuments({ schoolId, sectionId: id, status: { $ne: 'ARCHIVED' } }),
      Enrollment.countDocuments({ schoolId, sectionId: id, status: { $ne: 'ARCHIVED' } }),
      Timetable.countDocuments({ schoolId, sectionId: id, status: { $ne: 'ARCHIVED' } }),
      AttendanceRecord.countDocuments({ schoolId, sectionId: id }),
    ]);

    if (hasAssignments > 0 || hasEnrollments > 0 || hasTimetable > 0 || hasAttendance > 0) {
      throw new ValidationError('This section cannot be deleted because related records exist (students, timetable, or assignments).');
    }

    section.status = 'INACTIVE';
    await section.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'Section',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Section deactivated successfully');
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

    section.status = 'ACTIVE';
    await section.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'Section',
      entityId: section._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, section, 'Section activated successfully');
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
