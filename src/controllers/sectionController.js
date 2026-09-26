const Section = require('../models/Section');
const Grade = require('../models/Grade');
const Room = require('../models/Room');
const Staff = require('../models/Staff');
const TeacherAssignment = require('../models/TeacherAssignment');
const Enrollment = require('../models/Enrollment');
const Timetable = require('../models/Timetable');
const ClassSubject = require('../models/ClassSubject');
const Subject = require('../models/Subject');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getSections = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { gradeId, status, includeArchived, limit, academicYearId } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }

    if (gradeId) {
      filter.gradeId = gradeId;
    }

    let query = Section.find(filter)
      .populate('gradeId', 'name code category sequenceOrder')
      .populate('roomId', 'name capacity isLab')
      .populate('classTeacherId', 'firstName lastName employeeId email phone qualification designation isTeachingStaff');

    if (limit && Number(limit) > 0) {
      query = query.limit(Number(limit));
    }

    const sections = await query.lean();

    // Default sort: primarily by Grade sequenceOrder (1st Standard first),
    // then by Section code / name (Section A, Section B, etc.)
    sections.sort((a, b) => {
      const seqA = a.gradeId?.sequenceOrder ?? 999;
      const seqB = b.gradeId?.sequenceOrder ?? 999;
      if (seqA !== seqB) return seqA - seqB;
      const codeA = (a.code || a.name || '').toLowerCase();
      const codeB = (b.code || b.name || '').toLowerCase();
      return codeA.localeCompare(codeB);
    });

    // Populate section-level subjects and assigned teachers with minimal frontend fields
    if (sections.length > 0) {
      const sectionIds = sections.map((s) => s._id);
      const gradeIds = [...new Set(sections.map((s) => s.gradeId?._id || s.gradeId).filter(Boolean))];

      // 1. Fetch TeacherAssignment records for these sections
      const assignmentFilter = {
        schoolId,
        sectionId: { $in: sectionIds },
        status: { $ne: 'ARCHIVED' },
      };
      if (academicYearId) {
        assignmentFilter.academicYearId = academicYearId;
      }
      const assignments = await TeacherAssignment.find(assignmentFilter)
        .populate('subjectId', 'name code type')
        .populate('staffId', 'firstName lastName employeeId email designation')
        .lean();

      // Group assignments by sectionId string
      const assignmentsBySection = new Map();
      for (const a of assignments) {
        const sKey = String(a.sectionId);
        if (!assignmentsBySection.has(sKey)) {
          assignmentsBySection.set(sKey, []);
        }
        assignmentsBySection.get(sKey).push(a);
      }

      // 2. Fetch ClassSubject records for these grades
      const classSubjectFilter = {
        schoolId,
        gradeId: { $in: gradeIds },
        status: { $ne: 'ARCHIVED' },
      };
      if (academicYearId) {
        classSubjectFilter.academicYearId = academicYearId;
      }
      const classSubjects = await ClassSubject.find(classSubjectFilter)
        .populate('subjectId', 'name code type')
        .lean();

      // Group class subjects by gradeId string
      const classSubjectsByGrade = new Map();
      for (const cs of classSubjects) {
        const gKey = String(cs.gradeId);
        if (!classSubjectsByGrade.has(gKey)) {
          classSubjectsByGrade.set(gKey, []);
        }
        classSubjectsByGrade.get(gKey).push(cs);
      }

      // 3. For each section, attach minimal-field subjects with assigned teacher
      for (const section of sections) {
        const sKey = String(section._id);
        const gKey = String(section.gradeId?._id || section.gradeId);
        const sectionAssignments = assignmentsBySection.get(sKey) || [];
        const gradeClassSubjects = classSubjectsByGrade.get(gKey) || [];

        const subjectMap = new Map();

        // Add subjects from TeacherAssignment
        for (const a of sectionAssignments) {
          if (!a.subjectId) continue;
          const subIdStr = String(a.subjectId._id || a.subjectId);
          subjectMap.set(subIdStr, {
            _id: a.subjectId._id || a.subjectId,
            name: a.subjectId.name,
            code: a.subjectId.code,
            type: a.subjectId.type,
            teacherId: a.staffId?._id ? String(a.staffId._id) : (a.staffId ? String(a.staffId) : null),
            teacher: a.staffId ? {
              _id: a.staffId._id || a.staffId,
              firstName: a.staffId.firstName || '',
              lastName: a.staffId.lastName || '',
              employeeId: a.staffId.employeeId || '',
              name: `${a.staffId.firstName || ''} ${a.staffId.lastName || ''}`.trim(),
            } : null,
          });
        }

        // Add any additional class subjects for this grade that may not have a teacher assigned yet
        for (const cs of gradeClassSubjects) {
          if (!cs.subjectId) continue;
          const subIdStr = String(cs.subjectId._id || cs.subjectId);
          if (!subjectMap.has(subIdStr)) {
            subjectMap.set(subIdStr, {
              _id: cs.subjectId._id || cs.subjectId,
              name: cs.subjectId.name,
              code: cs.subjectId.code,
              type: cs.subjectId.type,
              teacherId: null,
              teacher: null,
            });
          }
        }

        section.subjects = Array.from(subjectMap.values());
      }
    }

    return successResponse(res, sections, 'Sections retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/** Resolves a submitted `roomId` against the school's actual Room master and
 * returns the {roomId, room} pair to persist — `room` (the legacy display
 * string) is always kept in sync with the real room's name, never freely
 * typed, so every place that still renders `section.room` shows real data.
 * Validates that the room is not already mapped to another section in this school. */
const resolveRoomSelection = async (schoolId, roomId, excludeSectionId = null) => {
  if (!roomId) return { roomId: null, room: '' };
  const room = await Room.findOne({ _id: roomId, schoolId, status: 'ACTIVE' }).lean();
  if (!room) {
    throw new ValidationError('Selected room does not exist or is not an active room for this school.');
  }

  // Check if room is already mapped to another section in this school
  const conflictFilter = {
    schoolId,
    roomId: room._id,
    status: { $ne: 'ARCHIVED' },
  };
  if (excludeSectionId) {
    conflictFilter._id = { $ne: excludeSectionId };
  }

  const conflictingSection = await Section.findOne(conflictFilter)
    .populate('gradeId', 'name')
    .lean();

  if (conflictingSection) {
    const gradeName = conflictingSection.gradeId?.name || 'Class';
    const sectionName = conflictingSection.name || 'Section';
    throw new ValidationError(
      `Room "${room.name}" is already assigned to Section "${sectionName}" (${gradeName}). Please select a different room.`
    );
  }

  return { roomId: room._id, room: room.name };
};

/**
 * Validates a submitted `classTeacherId` for assignment to a Section.
 * Enforces:
 * 1. Existence and school tenancy
 * 2. Active status and isTeachingStaff: true
 * 3. Exclusivity check (no teacher assigned to multiple active sections)
 */
const validateClassTeacherSelection = async (schoolId, classTeacherId, excludeSectionId = null) => {
  if (!classTeacherId) return null;

  const staff = await Staff.findOne({ _id: classTeacherId, schoolId }).lean();
  if (!staff) {
    throw new ValidationError('Selected staff member does not exist in this school.');
  }

  if (staff.status === 'INACTIVE' || staff.status === 'ARCHIVED') {
    throw new ValidationError(`Cannot assign inactive or archived staff member "${staff.firstName} ${staff.lastName}" as Class Teacher.`);
  }

  if (!staff.isTeachingStaff) {
    throw new ValidationError(
      `"${staff.firstName} ${staff.lastName} (${staff.employeeId})" is not registered as teaching faculty. Only certified teaching staff can be assigned as Class Teachers.`
    );
  }

  // Conflict Check: Check if teacher is already assigned as Class Teacher for another section
  const conflictFilter = {
    schoolId,
    classTeacherId: staff._id,
    status: { $ne: 'ARCHIVED' },
  };
  if (excludeSectionId) {
    conflictFilter._id = { $ne: excludeSectionId };
  }

  const conflictingSection = await Section.findOne(conflictFilter)
    .populate('gradeId', 'name')
    .lean();

  if (conflictingSection) {
    const gradeName = conflictingSection.gradeId?.name || 'Class';
    const sectionName = conflictingSection.name || 'Section';
    throw new ValidationError(
      `Teacher "${staff.firstName} ${staff.lastName} (${staff.employeeId})" is already assigned as Class Teacher for Section "${sectionName}" (${gradeName}). A teacher can only be assigned to one class section at a time.`
    );
  }

  return staff._id;
};

const createSection = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { gradeId, name, code, capacity = 40, roomId: requestedRoomId, classTeacherId: requestedClassTeacherId, status: requestedStatus } = req.body;

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
    const classTeacherId = await validateClassTeacherSelection(schoolId, requestedClassTeacherId);

    const section = await Section.create({
      schoolId,
      gradeId,
      name: trimmedName,
      code: formattedCode,
      capacity: capNum,
      roomId,
      room,
      classTeacherId,
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

    const populatedSection = await Section.findById(section._id)
      .populate('gradeId', 'name code category')
      .populate('roomId', 'name capacity isLab')
      .populate('classTeacherId', 'firstName lastName employeeId email phone qualification designation isTeachingStaff')
      .lean();

    return successResponse(res, populatedSection || section, 'Section created successfully', 201);
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
      const { roomId, room } = await resolveRoomSelection(schoolId, req.body.roomId, id);
      section.roomId = roomId;
      section.room = room;
    }

    if (req.body.classTeacherId !== undefined) {
      const validatedClassTeacherId = await validateClassTeacherSelection(schoolId, req.body.classTeacherId, id);
      section.classTeacherId = validatedClassTeacherId;
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

    const populatedSection = await Section.findById(section._id)
      .populate('gradeId', 'name code category')
      .populate('roomId', 'name capacity isLab')
      .populate('classTeacherId', 'firstName lastName employeeId email phone qualification designation isTeachingStaff')
      .lean();

    return successResponse(res, populatedSection || section, 'Section updated successfully');
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

    // If its room was reassigned to another section while inactive, clear it to avoid collision
    if (section.roomId) {
      const conflicting = await Section.findOne({
        _id: { $ne: id },
        schoolId,
        roomId: section.roomId,
        status: { $ne: 'ARCHIVED' },
      }).lean();
      if (conflicting) {
        section.roomId = null;
        section.room = '';
      }
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

    const populatedSection = await Section.findById(section._id)
      .populate('gradeId', 'name code category')
      .populate('roomId', 'name capacity isLab')
      .lean();

    return successResponse(res, populatedSection || section, 'Section activated successfully');
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
