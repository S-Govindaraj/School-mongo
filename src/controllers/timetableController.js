const Timetable = require('../models/Timetable');
const AcademicYear = require('../models/AcademicYear');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const Period = require('../models/Period');
const Subject = require('../models/Subject');
const Staff = require('../models/Staff');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const validateTimetableRelationsAndConflicts = async (schoolId, data, currentId = null) => {
  const {
    academicYearId,
    gradeId,
    sectionId,
    dayOfWeek,
    periodId,
    subjectId,
    teacherId,
    roomNumber,
  } = data;

  // 1. Verify Academic Year
  const year = await AcademicYear.findOne({ _id: academicYearId, schoolId });
  if (!year) throw new ValidationError('Selected academic year does not exist in this school.');

  // 2. Verify Grade
  const grade = await Grade.findOne({ _id: gradeId, schoolId });
  if (!grade) throw new ValidationError('Selected grade does not exist in this school.');

  // 3. Verify Section belongs to Grade
  const section = await Section.findOne({ _id: sectionId, schoolId });
  if (!section) throw new ValidationError('Selected section does not exist in this school.');
  if (String(section.gradeId) !== String(gradeId)) {
    throw new ValidationError('Selected section does not belong to the selected grade.');
  }

  // 4. Verify Period
  const period = await Period.findOne({ _id: periodId, schoolId });
  if (!period) throw new ValidationError('Selected period does not exist in this school.');

  // 5. Verify Subject is configured in ClassSubject for this grade and year
  const classSubject = await ClassSubject.findOne({
    schoolId,
    academicYearId,
    gradeId,
    subjectId,
    status: { $ne: 'ARCHIVED' },
  });
  if (!classSubject) {
    throw new ValidationError('This subject is not configured for the selected class.');
  }

  // 6. Verify Teacher exists and belongs to school
  const teacher = await Staff.findOne({ _id: teacherId, schoolId });
  if (!teacher) throw new ValidationError('Selected teacher does not exist in this school.');

  // 7. Verify Teacher is assigned to this class/subject in TeacherAssignment
  const assignment = await TeacherAssignment.findOne({
    schoolId,
    academicYearId,
    gradeId,
    sectionId,
    subjectId,
    staffId: teacherId,
    status: { $ne: 'ARCHIVED' },
  });
  if (!assignment) {
    throw new ValidationError('This teacher is not assigned to teach this subject to the selected section.');
  }

  // 8. Conflict Check 1: Section Conflict (Section double booking)
  const sectionQuery = {
    schoolId,
    academicYearId,
    sectionId,
    dayOfWeek,
    periodId,
    status: { $ne: 'ARCHIVED' },
  };
  if (currentId) sectionQuery._id = { $ne: currentId };
  const sectionConflict = await Timetable.findOne(sectionQuery);
  if (sectionConflict) {
    throw new ValidationError('This class already has a timetable entry for the selected period.');
  }

  // 9. Conflict Check 2: Teacher Conflict (Teacher double booking)
  const teacherQuery = {
    schoolId,
    academicYearId,
    teacherId,
    dayOfWeek,
    periodId,
    status: { $ne: 'ARCHIVED' },
  };
  if (currentId) teacherQuery._id = { $ne: currentId };
  const teacherConflict = await Timetable.findOne(teacherQuery);
  if (teacherConflict) {
    throw new ValidationError('This teacher is already assigned during the selected period.');
  }

  // 10. Conflict Check 3: Room Conflict (Room double booking)
  const room = String(roomNumber || '').trim();
  if (room) {
    const roomQuery = {
      schoolId,
      academicYearId,
      roomNumber: room,
      dayOfWeek,
      periodId,
      status: { $ne: 'ARCHIVED' },
    };
    if (currentId) roomQuery._id = { $ne: currentId };
    const roomConflict = await Timetable.findOne(roomQuery);
    if (roomConflict) {
      throw new ValidationError(`This room '${room}' is already occupied during the selected period.`);
    }
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
      status,
    });

    const populated = await Timetable.findById(entry._id)
      .populate('academicYearId', 'name code')
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code room')
      .populate('periodId', 'name code sequence startTime endTime')
      .populate('subjectId', 'name code shortName')
      .populate('teacherId', 'firstName lastName employeeId');

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

    const oldValues = entry.toObject();
    const merged = { ...entry.toObject(), ...req.body };
    await validateTimetableRelationsAndConflicts(schoolId, merged, id);

    Object.assign(entry, req.body);
    await entry.save();

    const populated = await Timetable.findById(entry._id)
      .populate('academicYearId', 'name code')
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code room')
      .populate('periodId', 'name code sequence startTime endTime')
      .populate('subjectId', 'name code shortName')
      .populate('teacherId', 'firstName lastName employeeId');

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

module.exports = {
  getTimetables,
  getSectionTimetable,
  getTeacherTimetable,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
};
