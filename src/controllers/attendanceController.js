const mongoose = require('mongoose');
const AttendanceDay = require('../models/AttendanceDay');
const AttendanceStatus = require('../models/AttendanceStatus');
const AttendanceAudit = require('../models/AttendanceAudit');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const AcademicYear = require('../models/AcademicYear');
const Holiday = require('../models/Holiday');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { withTransactionOrFallback } = require('../utils/withTransaction');
const { assertSectionInScope, applyScopeToFilter } = require('../services/attendanceScopeService');
const { createAbsenceNotifications } = require('../services/attendanceNotificationHelper');
const { upsertPeriodEntry, getAttendanceDay } = require('../services/attendanceDayService');
const SchoolSetting = require('../models/SchoolSetting');

/**
 * Single-collection attendance model: one AttendanceDay document per
 * student per calendar day, holding a `periods` array (DAILY schools use a
 * single synthetic entry with periodId: null). Replaces the old
 * AttendanceSession + AttendanceRecord two-collection design — see
 * src/models/AttendanceDay.js for the schema rationale.
 */

const checkHoliday = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { date } = req.query;
    if (!date) throw new ValidationError('date is required (YYYY-MM-DD).');

    const dateStr = new Date(date).toISOString().split('T')[0];
    const holiday = await Holiday.findOne({ schoolId, date: dateStr, status: 'ACTIVE' }).lean();

    return successResponse(
      res,
      holiday ? { isHoliday: true, holiday: { name: holiday.name, holidayType: holiday.holidayType } } : { isHoliday: false, holiday: null },
      'Holiday check complete'
    );
  } catch (error) {
    next(error);
  }
};

const getMyScope = async (req, res, next) => {
  try {
    return successResponse(res, req.attendanceScope, 'Attendance scope resolved');
  } catch (error) {
    next(error);
  }
};

/** Audit trail for one specific period entry within one student's day. */
const getPeriodAuditHistory = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { dayDocId, periodEntryId } = req.params;

    const day = await AttendanceDay.findOne({ _id: dayDocId, schoolId }).lean();
    if (!day) throw new NotFoundError('Attendance record not found');

    assertSectionInScope(req.attendanceScope, day.sectionId);

    const history = await AttendanceAudit.find({ schoolId, attendanceDayId: dayDocId, periodEntryId })
      .populate('previousStatusId', 'name code colorToken')
      .populate('newStatusId', 'name code colorToken')
      .populate('editedBy', 'name email')
      .sort({ timestamp: -1 })
      .lean();

    return successResponse(
      res,
      history.map((h) => ({ ...h, id: String(h._id) })),
      'Attendance audit history retrieved'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Lock/unlock a whole section's day (a specific period, or the sole DAILY
 * entry). sessionStatus lives per period-entry now, so this is an updateMany
 * across every student's AttendanceDay doc for that section/date, not a
 * single-document flip. Locking ALSO creates a LOCKED, unmarked placeholder
 * entry (statusId: null) for any actively-enrolled student who has no entry
 * yet — otherwise a "locked" day could still silently accept a brand-new
 * first-time mark for a student nobody got to yet. Unlocking never creates
 * placeholders (nothing to reopen for a student with no entry).
 */
const setSectionLock = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { sectionId } = req.params;
    const { date, academicYearId, attendanceType = 'DAILY', periodId, locked } = req.body;

    assertSectionInScope(req.attendanceScope, sectionId);
    if (!date || !academicYearId) throw new ValidationError('date and academicYearId are required.');

    const wantsUnlock = locked === false || locked === 'false';
    if (wantsUnlock) {
      const rolePermissions = req.user?.roleId?.permissions || [];
      const isAdmin = rolePermissions.includes('*') || rolePermissions.includes('attendance_view_all');
      if (!isAdmin) throw new ForbiddenError('Only an administrator can unlock attendance.');
    }

    const normalizedPeriodId = periodId || null;
    const targetDate = new Date(date);
    const newStatus = wantsUnlock ? 'SUBMITTED' : 'LOCKED';

    const updateResult = await AttendanceDay.updateMany(
      {
        schoolId,
        sectionId,
        date: targetDate,
        academicYearId,
        attendanceType,
        periods: { $elemMatch: { periodId: normalizedPeriodId, sessionStatus: wantsUnlock ? 'LOCKED' : { $ne: 'LOCKED' } } },
      },
      { $set: { 'periods.$[p].sessionStatus': newStatus } },
      { arrayFilters: [{ 'p.periodId': normalizedPeriodId }] }
    );

    let placeholdersCreated = 0;
    if (!wantsUnlock) {
      const activeEnrollments = await Enrollment.find({
        schoolId, sectionId, academicYearId, status: { $in: ['ENROLLED', 'ACTIVE'] },
      }).lean();

      const coveredDays = await AttendanceDay.find({
        schoolId, sectionId, date: targetDate, academicYearId, 'periods.periodId': normalizedPeriodId,
      }).select('studentId').lean();
      const coveredStudentIds = new Set(coveredDays.map((d) => String(d.studentId)));

      for (const enrollment of activeEnrollments) {
        if (coveredStudentIds.has(String(enrollment.studentId))) continue;
        await AttendanceDay.findOneAndUpdate(
          {
            schoolId, studentId: enrollment.studentId, date: targetDate, academicYearId,
            'periods.periodId': { $ne: normalizedPeriodId },
          },
          {
            $setOnInsert: {
              schoolId, academicYearId, date: targetDate, attendanceType,
              studentId: enrollment.studentId, enrollmentId: enrollment._id,
              gradeId: enrollment.gradeId, sectionId: enrollment.sectionId,
            },
            $push: { periods: { periodId: normalizedPeriodId, statusId: null, sessionStatus: 'LOCKED', source: 'SYSTEM' } },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
        placeholdersCreated++;
      }
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: wantsUnlock ? 'ATTENDANCE_UNLOCK' : 'ATTENDANCE_LOCK',
      entity: 'AttendanceDay',
      entityId: sectionId,
      newValues: { sectionId, date, periodId: normalizedPeriodId, sessionStatus: newStatus },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(
      res,
      { matchedCount: updateResult.matchedCount, modifiedCount: updateResult.modifiedCount, placeholdersCreated, sessionStatus: newStatus },
      wantsUnlock ? 'Attendance unlocked' : 'Attendance locked'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * The primary roster endpoint: one row per actively-enrolled student for a
 * date/period, whether scoped to one section or (sectionId omitted, admin
 * only — enforced by applyScopeToFilter) combined across every section a
 * grade or the whole school. Replaces the old getAttendanceSessions +
 * getSectionAttendanceSummary + the frontend's own client-side stitching of
 * enrollments/sessions/records into one table.
 */
const getRoster = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { date, academicYearId, gradeId, sectionId, attendanceType = 'DAILY', periodId } = req.query;
    if (!date || !academicYearId) throw new ValidationError('date and academicYearId are required.');

    const targetDate = new Date(date);
    const normalizedPeriodId = periodId || null;

    const enrollmentFilter = { schoolId, academicYearId, status: { $in: ['ENROLLED', 'ACTIVE'] } };
    if (gradeId) enrollmentFilter.gradeId = gradeId;
    if (sectionId) enrollmentFilter.sectionId = sectionId;
    applyScopeToFilter(enrollmentFilter, req.attendanceScope);

    const enrollments = await Enrollment.find(enrollmentFilter)
      .populate('studentId', 'firstName lastName studentNumber admissionNumber photo')
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code')
      .lean();

    const studentIds = enrollments.map((e) => e.studentId?._id || e.studentId);

    const dayFilter = { schoolId, academicYearId, date: targetDate, attendanceType, studentId: { $in: studentIds } };
    if (gradeId) dayFilter.gradeId = gradeId;
    if (sectionId) dayFilter.sectionId = sectionId;

    const days = studentIds.length
      ? await AttendanceDay.find(dayFilter).populate('periods.statusId', 'name code countsAsPresent countsAsAbsent colorToken').lean()
      : [];
    const dayByStudent = new Map(days.map((d) => [String(d.studentId), d]));

    const students = enrollments.map((e) => {
      const student = e.studentId || {};
      const sId = String(student._id || student.id);
      const day = dayByStudent.get(sId);
      const entry = day?.periods?.find((p) => String(p.periodId || '') === String(normalizedPeriodId || ''));
      return {
        studentId: sId,
        enrollmentId: String(e._id),
        dayDocId: day ? String(day._id) : null,
        periodEntryId: entry ? String(entry._id) : null,
        rollNumber: e.rollNumber || student.admissionNumber || '—',
        firstName: student.firstName,
        lastName: student.lastName,
        photo: student.photo || null,
        gradeId: String(e.gradeId?._id || e.gradeId || ''),
        gradeName: e.gradeId?.name || '',
        sectionId: String(e.sectionId?._id || e.sectionId || ''),
        sectionName: e.sectionId?.name || '',
        statusId: entry?.statusId?._id ? String(entry.statusId._id) : null,
        statusCode: entry?.statusId?.code || null,
        statusName: entry?.statusId?.name || null,
        colorToken: entry?.statusId?.colorToken || null,
        countsAsPresent: entry?.statusId?.countsAsPresent || false,
        countsAsAbsent: entry?.statusId?.countsAsAbsent || false,
        remarks: entry?.remarks || '',
        sessionStatus: entry?.sessionStatus || null,
      };
    });

    const markedCount = students.filter((s) => s.statusId).length;

    return successResponse(
      res,
      {
        date: targetDate,
        gradeId: gradeId || null,
        sectionId: sectionId || null,
        periodId: normalizedPeriodId,
        attendanceType,
        totalStudents: students.length,
        markedCount,
        students,
      },
      'Attendance roster retrieved'
    );
  } catch (error) {
    next(error);
  }
};

/** One student's full day — every period entry. Source for the View/Edit page. */
const getStudentDay = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { date } = req.query;
    let { academicYearId } = req.query;
    if (!date) throw new ValidationError('date is required.');

    if (!academicYearId) {
      const activeAY = await AcademicYear.findOne({ schoolId, isCurrent: true, status: 'ACTIVE' });
      academicYearId = activeAY?._id;
    }

    const day = await getAttendanceDay({ schoolId, studentId, date: new Date(date), academicYearId });
    if (day) assertSectionInScope(req.attendanceScope, day.sectionId);

    return successResponse(res, day ? { ...day, id: String(day._id) } : null, 'Attendance day retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * `target: 'SECTION'` (mark everyone) or `'STUDENTS'` (mark exactly the
 * listed studentIds) — both just describe what the caller put in `records`;
 * the write loop itself is target-agnostic. A student explicitly OMITTED
 * from `records` on a resubmit is left untouched (never treated as
 * "intentionally unmarked").
 */
const markBulkAttendance = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const {
      academicYearId, date, gradeId, sectionId, periodId, attendanceType = 'DAILY',
      target = 'STUDENTS', records = [],
    } = req.body;

    assertSectionInScope(req.attendanceScope, sectionId);
    if (!records.length) throw new ValidationError('At least one attendance record is required.');

    const targetDate = new Date(date);
    const normalizedPeriodId = periodId || null;

    // Validate backdated attendance policy from SchoolSetting
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const markDate = new Date(date);
    markDate.setHours(0, 0, 0, 0);

    if (markDate < today) {
      const schoolSetting = await SchoolSetting.findOne({ schoolId }).lean();
      if (schoolSetting && schoolSetting.attendance) {
        if (schoolSetting.attendance.allowBackdated === false) {
          throw new ValidationError('Backdated attendance recording is disabled in School Settings.');
        }
        const diffDays = Math.ceil((today.getTime() - markDate.getTime()) / (1000 * 60 * 60 * 24));
        if (schoolSetting.attendance.backdateLimitDays && diffDays > schoolSetting.attendance.backdateLimitDays) {
          throw new ValidationError(`Backdated attendance is restricted to ${schoolSetting.attendance.backdateLimitDays} day(s) by School Settings (attempted: ${diffDays} days).`);
        }
      }
    }

    const allStatuses = await AttendanceStatus.find({ schoolId, status: 'ACTIVE' });
    const statusMap = new Map(allStatuses.map((s) => [String(s._id), s]));

    const recordStudentIds = records.map((r) => r.studentId);
    const activeEnrollments = await Enrollment.find({
      schoolId, studentId: { $in: recordStudentIds }, gradeId, sectionId, academicYearId,
      status: { $in: ['ENROLLED', 'ACTIVE'] },
    });
    const enrollmentMap = new Map(activeEnrollments.map((e) => [String(e.studentId), e]));

    const newAbsences = [];
    let writtenCount = 0;
    let lockedCount = 0;

    for (const item of records) {
      const { studentId, enrollmentId, statusId, remarks } = item;
      const activeEnrollment = enrollmentMap.get(String(studentId));
      if (!activeEnrollment) {
        throw new ValidationError(`Student ${studentId} is not enrolled in this section for the selected academic year.`);
      }

      const statusDoc = statusMap.get(String(statusId));
      if (!statusDoc) throw new ValidationError(`Invalid or inactive attendance status: ${statusId}.`);
      if (statusDoc.requiresReason || ['EXCUSED', 'LEAVE'].includes(statusDoc.code)) {
        if (!remarks || !String(remarks).trim()) {
          throw new ValidationError(`A reason is required when marking attendance as ${statusDoc.name || statusDoc.code}.`);
        }
      }

      const result = await upsertPeriodEntry({
        schoolId, academicYearId, date: targetDate, attendanceType,
        studentId, enrollmentId: enrollmentId || activeEnrollment._id, gradeId, sectionId,
        periodId: normalizedPeriodId,
        fields: {
          statusId,
          remarks: String(remarks || '').trim(),
          markedBy: req.user?._id,
          markedAt: new Date(),
          source: 'BULK',
        },
      });

      if (result.outcome === 'LOCKED') {
        lockedCount++;
        continue;
      }
      writtenCount++;
      if (statusDoc.countsAsAbsent) {
        newAbsences.push({ studentId, statusName: statusDoc.name, date: targetDate, recordId: result.dayId });
      }
    }

    if (writtenCount === 0 && lockedCount > 0) {
      throw new ValidationError('This attendance period is locked and cannot be modified.');
    }

    createAbsenceNotifications(schoolId, newAbsences);

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'MARK',
      entity: 'AttendanceDay',
      entityId: sectionId,
      details: { target, count: writtenCount, lockedSkipped: lockedCount, date, sectionId, periodId: normalizedPeriodId },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(
      res,
      { count: writtenCount, lockedSkipped: lockedCount, date: targetDate, sectionId, periodId: normalizedPeriodId },
      'Attendance marked successfully'
    );
  } catch (error) {
    next(error);
  }
};

/** Corrects one period entry within one student's day. Mandatory reason, audited. */
const correctPeriodEntry = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId, date, periodEntryId } = req.params;
    const { newStatusId, statusId, reason, academicYearId } = req.body;
    const targetStatusId = newStatusId || statusId;

    if (!reason || !String(reason).trim()) {
      throw new ValidationError('A mandatory reason is required to correct attendance records.');
    }
    if (!academicYearId) throw new ValidationError('academicYearId is required.');

    const targetDate = new Date(date);
    const day = await AttendanceDay.findOne({ schoolId, studentId, date: targetDate, academicYearId });
    if (!day) throw new NotFoundError('Attendance record not found');

    assertSectionInScope(req.attendanceScope, day.sectionId);

    const entry = day.periods.id(periodEntryId);
    if (!entry) throw new NotFoundError('Attendance period entry not found');
    if (entry.sessionStatus === 'LOCKED') {
      throw new ValidationError('This attendance period is locked and cannot be modified. Ask an administrator to unlock it first.');
    }

    const targetStatusDoc = await AttendanceStatus.findOne({ _id: targetStatusId, schoolId, status: 'ACTIVE' });
    if (!targetStatusDoc) throw new ValidationError(`Invalid or inactive attendance status: ${targetStatusId}.`);

    const previousStatusId = entry.statusId;

    await withTransactionOrFallback(async (mongoSession) => {
      await AttendanceAudit.create(
        [{
          schoolId,
          attendanceDayId: day._id,
          periodEntryId: entry._id,
          previousStatusId,
          newStatusId: targetStatusId,
          reason: String(reason).trim(),
          editedBy: req.user._id,
          timestamp: new Date(),
          ipAddress: req.ip,
          requestId: req.requestId || '',
        }],
        { session: mongoSession }
      );

      entry.statusId = targetStatusId;
      entry.remarks = `Corrected: ${String(reason).trim()}`;
      entry.markedBy = req.user._id;
      entry.markedAt = new Date();
      await day.save({ session: mongoSession });
    });

    if (targetStatusDoc.countsAsAbsent) {
      createAbsenceNotifications(schoolId, [
        { studentId: day.studentId, statusName: targetStatusDoc.name, date: day.date, recordId: day._id },
      ]);
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ATTENDANCE_CORRECT',
      entity: 'AttendanceDay',
      entityId: day._id.toString(),
      oldValues: { statusId: previousStatusId },
      newValues: { statusId: targetStatusId },
      reason: String(reason).trim(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, { ...day.toObject(), id: String(day._id) }, 'Attendance record corrected successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Per confirmed decision: PERIOD-mode summaries roll up as a percentage over
 * PERIOD-SLOTS (every marked period entry counted individually across the
 * date range), not one representative "day status" — this needs no special
 * casing for DAILY schools, since a DAILY day's single synthetic entry is
 * just one slot.
 */
const getStudentSummary = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    let { academicYearId } = req.query;

    if (!academicYearId) {
      const activeAY = await AcademicYear.findOne({ schoolId, isCurrent: true, status: 'ACTIVE' });
      academicYearId = activeAY?._id;
    }

    const days = await AttendanceDay.find({ schoolId, studentId, academicYearId })
      .populate('periods.statusId', 'name code countsAsPresent countsAsAbsent colorToken')
      .populate('periods.periodId', 'name sequence')
      .sort({ date: -1 })
      .lean();

    let totalSlots = 0, presentSlots = 0, absentSlots = 0, lateSlots = 0, excusedSlots = 0;
    const dayRows = [];

    for (const day of days) {
      const markedPeriods = (day.periods || []).filter((p) => p.statusId);
      markedPeriods.forEach((p) => {
        totalSlots++;
        if (p.statusId?.countsAsPresent) presentSlots++;
        if (p.statusId?.countsAsAbsent) absentSlots++;
        if (p.statusId?.code === 'LATE') lateSlots++;
        if (['EXCUSED', 'LEAVE'].includes(p.statusId?.code)) excusedSlots++;
      });

      if (markedPeriods.length > 0) {
        dayRows.push({
          id: String(day._id),
          date: day.date,
          attendanceType: day.attendanceType,
          periods: markedPeriods.map((p) => ({
            id: String(p._id),
            periodId: p.periodId?._id || null,
            periodName: p.periodId?.name || null,
            statusId: p.statusId?._id,
            statusName: p.statusId?.name,
            statusCode: p.statusId?.code,
            colorToken: p.statusId?.colorToken,
            remarks: p.remarks,
            sessionStatus: p.sessionStatus,
          })),
        });
      }
    }

    const pct = totalSlots > 0 ? Math.round((presentSlots / totalSlots) * 100) : 100;

    return successResponse(
      res,
      {
        studentId,
        academicYearId,
        totalDays: dayRows.length,
        totalSlots, presentSlots, absentSlots, lateSlots, excusedSlots,
        attendancePercentage: pct,
        days: dayRows,
      },
      'Student attendance summary retrieved'
    );
  } catch (error) {
    next(error);
  }
};

const getSchoolSummary = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { date } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const schoolObjectId = new mongoose.Types.ObjectId(schoolId);

    const [totalStudents, agg] = await Promise.all([
      Student.countDocuments({ schoolId, status: 'ACTIVE' }),
      AttendanceDay.aggregate([
        { $match: { schoolId: schoolObjectId, date: { $gte: startOfDay, $lte: endOfDay } } },
        { $unwind: '$periods' },
        { $match: { 'periods.statusId': { $ne: null } } },
        { $lookup: { from: 'attendanceStatuses', localField: 'periods.statusId', foreignField: '_id', as: 'status' } },
        { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'grades', localField: 'gradeId', foreignField: '_id', as: 'grade' } },
        { $unwind: { path: '$grade', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'sections', localField: 'sectionId', foreignField: '_id', as: 'section' } },
        { $unwind: { path: '$section', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$sectionId',
            gradeName: { $first: '$grade.name' },
            sectionName: { $first: '$section.name' },
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ['$status.countsAsPresent', true] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status.countsAsAbsent', true] }, 1, 0] } },
            late: { $sum: { $cond: [{ $eq: ['$status.code', 'LATE'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    let presentToday = 0, absentToday = 0, lateToday = 0, totalRecords = 0;
    const sections = agg.map((s) => {
      presentToday += s.present;
      absentToday += s.absent;
      lateToday += s.late;
      totalRecords += s.total;
      return {
        gradeName: s.gradeName || 'Grade',
        sectionName: s.sectionName || 'Section',
        total: s.total, present: s.present, absent: s.absent,
        percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
      };
    });

    const pct = totalRecords > 0 ? Math.round((presentToday / totalRecords) * 100) : 100;

    return successResponse(
      res,
      {
        totalStudents,
        totalRecords,
        markedToday: totalRecords,
        presentToday, presentCount: presentToday,
        absentToday, absentCount: absentToday,
        lateToday, lateCount: lateToday,
        attendancePercentage: pct,
        sections,
      },
      'School attendance summary retrieved'
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkHoliday,
  getMyScope,
  getPeriodAuditHistory,
  setSectionLock,
  getRoster,
  getStudentDay,
  markBulkAttendance,
  correctPeriodEntry,
  getStudentSummary,
  getSchoolSummary,
};
