const Timetable = require('../models/Timetable');
const AcademicYear = require('../models/AcademicYear');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const Period = require('../models/Period');
const Subject = require('../models/Subject');
const Staff = require('../models/Staff');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');

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
    const { academicYearId, gradeId, sectionId, dayOfWeek, periodId, subjectId, teacherId, roomNumber } = req.body;

    // 1. Check section conflict (section double booking)
    const sectionConflict = await Timetable.findOne({
      schoolId,
      academicYearId,
      sectionId,
      dayOfWeek,
      periodId,
      status: { $ne: 'ARCHIVED' },
    });
    if (sectionConflict) {
      throw new ValidationError('Section already has a subject assigned during this period on ' + dayOfWeek);
    }

    // 2. Check teacher conflict (teacher double booking)
    const teacherConflict = await Timetable.findOne({
      schoolId,
      academicYearId,
      teacherId,
      dayOfWeek,
      periodId,
      status: { $ne: 'ARCHIVED' },
    });
    if (teacherConflict) {
      throw new ValidationError('Teacher is already assigned to another class during this period on ' + dayOfWeek);
    }

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
      status: 'ACTIVE',
    });

    return successResponse(res, entry, 'Timetable entry created successfully', 201);
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

    const { teacherId, periodId, dayOfWeek, sectionId, academicYearId } = { ...entry.toObject(), ...req.body };

    // Validate teacher conflict if teacher or slot changed
    const teacherConflict = await Timetable.findOne({
      _id: { $ne: id },
      schoolId,
      academicYearId,
      teacherId,
      dayOfWeek,
      periodId,
      status: { $ne: 'ARCHIVED' },
    });
    if (teacherConflict) {
      throw new ValidationError('Teacher is already assigned to another class during this period');
    }

    Object.assign(entry, req.body);
    await entry.save();

    return successResponse(res, entry, 'Timetable entry updated successfully');
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
