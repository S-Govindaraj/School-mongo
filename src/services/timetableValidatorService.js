const AcademicYear = require('../models/AcademicYear');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const Period = require('../models/Period');
const Subject = require('../models/Subject');
const Staff = require('../models/Staff');
const Room = require('../models/Room');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const Timetable = require('../models/Timetable');

const HARD = 'HARD';
const SOFT = 'SOFT';

/**
 * In-memory index of everything needed to validate/generate timetable slots
 * for one school + academic year, without a DB round-trip per candidate.
 * Two construction paths:
 *  - buildFullContext(): loads every relevant record once — used by the
 *    generator's tight placement loop.
 *  - buildScopedContext(): loads only what one candidate slot touches — used
 *    by manual create/update/validate, mirroring the cost of the original
 *    single-slot controller logic it replaces.
 * Both produce the same shape, so validateSlot() never needs to know which
 * one it's looking at.
 */
class TimetableWorkingContext {
  constructor({ schoolId, academicYearId }) {
    this.schoolId = String(schoolId);
    this.academicYearId = String(academicYearId);

    this.years = new Map();
    this.grades = new Map();
    this.sections = new Map();
    this.periods = new Map();
    this.subjects = new Map();
    this.staffById = new Map();
    this.rooms = new Map();
    this.classSubjects = new Map(); // `${gradeId}|${subjectId}` -> doc
    this.teacherAssignments = new Map(); // `${sectionId}|${subjectId}|${teacherId}` -> doc

    // Live occupancy indexes, keyed for O(1) conflict lookup. Values are the
    // Timetable _id occupying that slot (or a placeholder id while the
    // generator hasn't persisted anything yet).
    this.sectionSlots = new Map(); // `${sectionId}|${day}|${periodId}` -> id
    this.teacherSlots = new Map(); // `${teacherId}|${day}|${periodId}` -> id
    this.roomSlots = new Map(); // `room:{id|num}|${day}|${periodId}` -> id

    // Distribution bookkeeping for soft/subject-frequency constraints.
    this.sectionSubjectDaily = new Map(); // `${sectionId}|${subjectId}|${day}` -> count
    this.sectionDaySequence = new Map(); // `${sectionId}|${day}` -> [{sequence, subjectId, periodId}] asc by sequence
  }

  static roomKey(candidate) {
    if (candidate.roomId) return `room:id:${String(candidate.roomId)}`;
    const num = String(candidate.roomNumber || '').trim();
    return num ? `room:num:${num}` : null;
  }

  place(slot) {
    const day = slot.dayOfWeek;
    const periodId = String(slot.periodId);
    const id = String(slot._id || slot.id || `pending:${this.sectionSlots.size}:${this.teacherSlots.size}`);

    this.sectionSlots.set(`${slot.sectionId}|${day}|${periodId}`, id);
    this.teacherSlots.set(`${slot.teacherId}|${day}|${periodId}`, id);
    const rk = TimetableWorkingContext.roomKey(slot);
    if (rk) this.roomSlots.set(`${rk}|${day}|${periodId}`, id);

    const dailyKey = `${slot.sectionId}|${slot.subjectId}|${day}`;
    this.sectionSubjectDaily.set(dailyKey, (this.sectionSubjectDaily.get(dailyKey) || 0) + 1);

    const seqKey = `${slot.sectionId}|${day}`;
    const period = this.periods.get(periodId);
    const list = this.sectionDaySequence.get(seqKey) || [];
    list.push({ sequence: period?.sequence ?? 0, subjectId: String(slot.subjectId), periodId });
    list.sort((a, b) => a.sequence - b.sequence);
    this.sectionDaySequence.set(seqKey, list);

    return id;
  }

  remove(slot) {
    const day = slot.dayOfWeek;
    const periodId = String(slot.periodId);
    this.sectionSlots.delete(`${slot.sectionId}|${day}|${periodId}`);
    this.teacherSlots.delete(`${slot.teacherId}|${day}|${periodId}`);
    const rk = TimetableWorkingContext.roomKey(slot);
    if (rk) this.roomSlots.delete(`${rk}|${day}|${periodId}`);

    const dailyKey = `${slot.sectionId}|${slot.subjectId}|${day}`;
    const count = (this.sectionSubjectDaily.get(dailyKey) || 1) - 1;
    if (count <= 0) this.sectionSubjectDaily.delete(dailyKey);
    else this.sectionSubjectDaily.set(dailyKey, count);

    const seqKey = `${slot.sectionId}|${day}`;
    const list = (this.sectionDaySequence.get(seqKey) || []).filter((e) => e.periodId !== periodId);
    this.sectionDaySequence.set(seqKey, list);
  }
}

const CONFLICT = (type, message, severity = HARD) => ({ type, message, severity });

/**
 * Pure, synchronous, I/O-free. The same function checks a single manual edit
 * and every candidate the generator tries — only the context differs.
 *
 * @param {object} candidate {academicYearId, gradeId, sectionId, dayOfWeek,
 *   periodId, subjectId, teacherId, roomId?, roomNumber?, excludeTimetableId?}
 * @param {TimetableWorkingContext} ctx
 * @param {object} [options] {hardOnly?: boolean, constraints?: {maxConsecutivePerSubject, minGapPeriods, maxPeriodsPerDay}}
 * @returns {{valid: boolean, conflicts: Array<{type, message, severity}>}}
 */
const validateSlot = (candidate, ctx, options = {}) => {
  const hardOnly = options.hardOnly === true;
  const constraints = options.constraints || {};
  const excludeId = candidate.excludeTimetableId ? String(candidate.excludeTimetableId) : null;
  const conflicts = [];

  if (String(candidate.academicYearId) !== ctx.academicYearId) {
    conflicts.push(CONFLICT('INVALID_ACADEMIC_YEAR', 'Selected academic year does not match this generation/edit context.'));
  }

  const grade = ctx.grades.get(String(candidate.gradeId));
  if (!grade) conflicts.push(CONFLICT('INVALID_GRADE', 'Selected grade does not exist in this school.'));

  const section = ctx.sections.get(String(candidate.sectionId));
  if (!section) {
    conflicts.push(CONFLICT('INVALID_SECTION', 'Selected section does not exist in this school.'));
  } else if (String(section.gradeId) !== String(candidate.gradeId)) {
    conflicts.push(CONFLICT('INVALID_SECTION', 'Selected section does not belong to the selected grade.'));
  } else if (section.status === 'ARCHIVED') {
    conflicts.push(CONFLICT('INVALID_SECTION', 'Selected section is archived and cannot receive a timetable.'));
  }

  const period = ctx.periods.get(String(candidate.periodId));
  if (!period) {
    conflicts.push(CONFLICT('PERIOD_UNAVAILABLE', 'Selected period does not exist in this school.'));
  } else if (period.isBreak) {
    conflicts.push(CONFLICT('PERIOD_UNAVAILABLE', 'Cannot schedule a class during a break period.'));
  }

  const subject = ctx.subjects.get(String(candidate.subjectId));
  if (subject && subject.status === 'ARCHIVED') {
    conflicts.push(CONFLICT('SUBJECT_NOT_CONFIGURED', 'Selected subject is inactive and cannot be scheduled.'));
  }
  const classSubject = ctx.classSubjects.get(`${candidate.gradeId}|${candidate.subjectId}`);
  if (!classSubject) {
    conflicts.push(CONFLICT('SUBJECT_NOT_CONFIGURED', 'This subject is not configured for the selected class.'));
  }

  const teacher = ctx.staffById.get(String(candidate.teacherId));
  if (teacher && teacher.status !== 'ACTIVE') {
    conflicts.push(CONFLICT('TEACHER_NOT_ASSIGNED', 'Selected teacher is inactive and cannot be scheduled.'));
  }
  const assignment = ctx.teacherAssignments.get(`${candidate.sectionId}|${candidate.subjectId}|${candidate.teacherId}`);
  if (!assignment) {
    conflicts.push(CONFLICT('TEACHER_NOT_ASSIGNED', 'This teacher is not assigned to teach this subject to the selected section.'));
  }

  if (teacher && period) {
    const unavail = (teacher.unavailability || []).find((u) => u.dayOfWeek === candidate.dayOfWeek);
    if (unavail) {
      const periodIds = (unavail.periods || []).map(String);
      if (periodIds.length === 0) {
        conflicts.push(CONFLICT('TEACHER_UNAVAILABLE', `${teacher.firstName || 'Teacher'} ${teacher.lastName || ''}`.trim() + ` is unavailable on ${candidate.dayOfWeek}.`));
      } else if (periodIds.includes(String(candidate.periodId))) {
        conflicts.push(CONFLICT('TEACHER_UNAVAILABLE', `${teacher.firstName || 'Teacher'} ${teacher.lastName || ''}`.trim() + ` is unavailable during this period on ${candidate.dayOfWeek}.`));
      }
    }
  }

  const sectionKey = `${candidate.sectionId}|${candidate.dayOfWeek}|${candidate.periodId}`;
  const sectionOccupant = ctx.sectionSlots.get(sectionKey);
  if (sectionOccupant && sectionOccupant !== excludeId) {
    conflicts.push(CONFLICT('SECTION_CONFLICT', 'This class already has a timetable entry for the selected period.'));
  }

  const teacherKey = `${candidate.teacherId}|${candidate.dayOfWeek}|${candidate.periodId}`;
  const teacherOccupant = ctx.teacherSlots.get(teacherKey);
  if (teacherOccupant && teacherOccupant !== excludeId) {
    conflicts.push(CONFLICT('TEACHER_CONFLICT', 'This teacher is already assigned during the selected period.'));
  }

  const roomKey = TimetableWorkingContext.roomKey(candidate);
  if (roomKey) {
    const roomOccupant = ctx.roomSlots.get(`${roomKey}|${candidate.dayOfWeek}|${candidate.periodId}`);
    if (roomOccupant && roomOccupant !== excludeId) {
      const room = candidate.roomId ? ctx.rooms.get(String(candidate.roomId)) : null;
      const type = room?.isLab ? 'LAB_CONFLICT' : 'ROOM_CONFLICT';
      const label = room?.name || candidate.roomNumber || 'This room';
      conflicts.push(CONFLICT(type, `${label} is already occupied during the selected period.`));
    }
  }

  // --- Soft / configurable constraints — never block validity on their own,
  // and skipped entirely when hardOnly is requested (both for performance in
  // the generator's tight pruning loop, and so callers asking for hardOnly
  // never see irrelevant soft entries in the returned conflicts array). ---
  if (!hardOnly) {
    const dailyKey = `${candidate.sectionId}|${candidate.subjectId}|${candidate.dayOfWeek}`;
    const dailyCount = ctx.sectionSubjectDaily.get(dailyKey) || 0;
    if (constraints.maxPeriodsPerDay && dailyCount >= constraints.maxPeriodsPerDay) {
      conflicts.push(CONFLICT('SUBJECT_DAILY_LIMIT', `This subject already has ${dailyCount} period(s) scheduled on ${candidate.dayOfWeek} (limit ${constraints.maxPeriodsPerDay}).`, SOFT));
    }

    if (period && (constraints.maxConsecutivePerSubject || constraints.minGapPeriods)) {
      const seq = ctx.sectionDaySequence.get(`${candidate.sectionId}|${candidate.dayOfWeek}`) || [];
      const sameSubjectSequences = seq.filter((e) => e.subjectId === String(candidate.subjectId)).map((e) => e.sequence);
      if (sameSubjectSequences.length) {
        const nearest = sameSubjectSequences.reduce((best, s) => (Math.abs(s - period.sequence) < Math.abs(best - period.sequence) ? s : best), sameSubjectSequences[0]);
        const gap = Math.abs(period.sequence - nearest);
        if (constraints.minGapPeriods && gap > 0 && gap <= constraints.minGapPeriods) {
          conflicts.push(CONFLICT('SUBJECT_GAP_VIOLATION', `Placing this subject here leaves only ${gap - 1} period(s) gap from another ${candidate.dayOfWeek} slot (minimum gap ${constraints.minGapPeriods}).`, SOFT));
        }
        if (constraints.maxConsecutivePerSubject && gap === 1) {
          // Count the run length this placement would extend.
          const sorted = [...sameSubjectSequences, period.sequence].sort((a, b) => a - b);
          let run = 1;
          let best = 1;
          for (let i = 1; i < sorted.length; i++) {
            run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
            best = Math.max(best, run);
          }
          if (best > constraints.maxConsecutivePerSubject) {
            conflicts.push(CONFLICT('SUBJECT_CONSECUTIVE_LIMIT', `This would create ${best} consecutive periods of the same subject (limit ${constraints.maxConsecutivePerSubject}).`, SOFT));
          }
        }
      }
    }
  }

  const valid = conflicts.every((c) => c.severity !== HARD);
  return { valid, conflicts };
};

/** Loads only what one candidate slot touches — used for manual create/update/validate. */
const buildScopedContext = async (schoolId, data, excludeTimetableId = null) => {
  const { academicYearId, gradeId, sectionId, dayOfWeek, periodId, subjectId, teacherId, roomId, roomNumber } = data;
  const ctx = new TimetableWorkingContext({ schoolId, academicYearId });

  const room = String(roomNumber || '').trim();
  const sectionConflictQuery = { schoolId, academicYearId, sectionId, dayOfWeek, periodId, status: { $ne: 'ARCHIVED' } };
  const teacherConflictQuery = { schoolId, academicYearId, teacherId, dayOfWeek, periodId, status: { $ne: 'ARCHIVED' } };
  const roomConflictQuery = roomId
    ? { schoolId, academicYearId, roomId, dayOfWeek, periodId, status: { $ne: 'ARCHIVED' } }
    : room
      ? { schoolId, academicYearId, roomNumber: room, dayOfWeek, periodId, status: { $ne: 'ARCHIVED' } }
      : null;

  const [year, grade, section, period, subject, classSubject, teacher, assignment, sectionConflict, teacherConflict, roomConflict, roomDoc] = await Promise.all([
    AcademicYear.findOne({ _id: academicYearId, schoolId }).lean(),
    Grade.findOne({ _id: gradeId, schoolId }).lean(),
    Section.findOne({ _id: sectionId, schoolId }).lean(),
    Period.findOne({ _id: periodId, schoolId }).lean(),
    Subject.findOne({ _id: subjectId, schoolId }).lean(),
    ClassSubject.findOne({ schoolId, academicYearId, gradeId, subjectId, status: { $ne: 'ARCHIVED' } }).lean(),
    Staff.findOne({ _id: teacherId, schoolId }).lean(),
    TeacherAssignment.findOne({ schoolId, academicYearId, gradeId, sectionId, subjectId, staffId: teacherId, status: { $ne: 'ARCHIVED' } }).lean(),
    Timetable.findOne(sectionConflictQuery).lean(),
    Timetable.findOne(teacherConflictQuery).lean(),
    roomConflictQuery ? Timetable.findOne(roomConflictQuery).lean() : Promise.resolve(null),
    roomId ? Room.findOne({ _id: roomId, schoolId }).lean() : Promise.resolve(null),
  ]);

  if (year) ctx.years.set(String(year._id), year);
  if (grade) ctx.grades.set(String(grade._id), grade);
  if (section) ctx.sections.set(String(section._id), section);
  if (period) ctx.periods.set(String(period._id), period);
  if (subject) ctx.subjects.set(String(subject._id), subject);
  if (teacher) ctx.staffById.set(String(teacher._id), teacher);
  if (roomDoc) ctx.rooms.set(String(roomDoc._id), roomDoc);
  if (classSubject) ctx.classSubjects.set(`${gradeId}|${subjectId}`, classSubject);
  if (assignment) ctx.teacherAssignments.set(`${sectionId}|${subjectId}|${teacherId}`, assignment);

  const key = (day, pid) => `${day}|${pid}`;
  if (sectionConflict && String(sectionConflict._id) !== String(excludeTimetableId || '')) {
    ctx.sectionSlots.set(`${sectionId}|${key(dayOfWeek, periodId)}`, String(sectionConflict._id));
  }
  if (teacherConflict && String(teacherConflict._id) !== String(excludeTimetableId || '')) {
    ctx.teacherSlots.set(`${teacherId}|${key(dayOfWeek, periodId)}`, String(teacherConflict._id));
  }
  if (roomConflict && String(roomConflict._id) !== String(excludeTimetableId || '')) {
    const rk = TimetableWorkingContext.roomKey({ roomId, roomNumber: room });
    if (rk) ctx.roomSlots.set(`${rk}|${key(dayOfWeek, periodId)}`, String(roomConflict._id));
  }

  return ctx;
};

/** Loads every relevant record once for a whole generation run (or bulk save revalidation). */
const buildFullContext = async ({ schoolId, academicYearId, campusId = null, sectionIds = null }) => {
  const ctx = new TimetableWorkingContext({ schoolId, academicYearId });

  const sectionFilter = { schoolId };
  if (sectionIds?.length) sectionFilter._id = { $in: sectionIds };

  const [years, grades, sections, periods, subjects, staff, rooms, classSubjects, assignments, existingSlots] = await Promise.all([
    AcademicYear.find({ schoolId }).lean(),
    Grade.find({ schoolId, status: { $ne: 'ARCHIVED' } }).lean(),
    Section.find({ ...sectionFilter, status: { $ne: 'ARCHIVED' } }).lean(),
    Period.find({ schoolId, status: { $ne: 'ARCHIVED' } }).lean(),
    Subject.find({ schoolId, status: { $ne: 'ARCHIVED' } }).lean(),
    Staff.find({ schoolId, isTeachingStaff: true, status: 'ACTIVE' }).lean(),
    Room.find({ schoolId, status: { $ne: 'ARCHIVED' } }).lean(),
    ClassSubject.find({ schoolId, academicYearId, status: { $ne: 'ARCHIVED' } }).lean(),
    TeacherAssignment.find({ schoolId, academicYearId, status: { $ne: 'ARCHIVED' } }).lean(),
    Timetable.find({ schoolId, academicYearId, status: 'ACTIVE' }).lean(),
  ]);

  years.forEach((y) => ctx.years.set(String(y._id), y));
  grades.forEach((g) => ctx.grades.set(String(g._id), g));
  sections.forEach((s) => ctx.sections.set(String(s._id), s));
  periods.forEach((p) => ctx.periods.set(String(p._id), p));
  subjects.forEach((s) => ctx.subjects.set(String(s._id), s));
  staff.forEach((s) => ctx.staffById.set(String(s._id), s));
  rooms.forEach((r) => ctx.rooms.set(String(r._id), r));
  classSubjects.forEach((cs) => ctx.classSubjects.set(`${cs.gradeId}|${cs.subjectId}`, cs));
  assignments.forEach((a) => ctx.teacherAssignments.set(`${a.sectionId}|${a.subjectId}|${a.staffId}`, a));
  existingSlots.forEach((slot) => ctx.place(slot));

  // Tally locked slots per (section, subject) so the generator can subtract
  // them from a subject's remaining weekly requirement — locked cells are
  // immutable and already occupy real periods.
  ctx.lockedCountBySectionSubject = new Map();
  existingSlots.filter((s) => s.isLocked).forEach((s) => {
    const key = `${s.sectionId}|${s.subjectId}`;
    ctx.lockedCountBySectionSubject.set(key, (ctx.lockedCountBySectionSubject.get(key) || 0) + 1);
  });

  return ctx;
};

class TimetableValidatorService {
  static validateSlot(candidate, context, options) {
    return validateSlot(candidate, context, options);
  }

  static buildScopedContext(schoolId, data, excludeTimetableId = null) {
    return buildScopedContext(schoolId, data, excludeTimetableId);
  }

  static buildFullContext(params) {
    return buildFullContext(params);
  }

  static WorkingContext = TimetableWorkingContext;
}

module.exports = { TimetableValidatorService, TimetableWorkingContext };
