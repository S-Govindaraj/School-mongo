const Enrollment = require('../models/Enrollment');
const AttendanceStatus = require('../models/AttendanceStatus');
const AttendanceDay = require('../models/AttendanceDay');
const { upsertPeriodEntry } = require('./attendanceDayService');
const logger = require('../config/logger');

/**
 * Syncs an APPROVED leave request onto attendance: sets the school's
 * LEAVE/EXCUSED status for every day in [fromDate, toDate]. For a DAILY
 * section, that's the single synthetic entry (periodId: null); for a
 * PERIOD section, every period entry that already exists for that day is
 * set to LEAVE, and if none exist yet a single DAILY-shaped placeholder
 * entry is created so the day isn't left with an empty periods array.
 *
 * Deliberately DOES overwrite a status a teacher already marked for that
 * day (source: 'SYSTEM' distinguishes it from a teacher's 'BULK'/'MANUAL'
 * mark) — an approved leave is meant to be the authoritative record from
 * that point on. It does NOT touch a LOCKED entry, and does not attempt to
 * revert entries if a leave is later cancelled (that would require knowing
 * whether the entry was independently corrected since, which the schema
 * can't distinguish safely) — see ATTENDANCE_REDESIGN.md.
 *
 * Never throws — a sync failure must not block the leave approval itself;
 * callers should await this but treat it as best-effort.
 */
async function syncApprovedLeaveToAttendance(leave, schoolId, actorId) {
  try {
    const enrollment = await Enrollment.findOne({
      schoolId,
      studentId: leave.studentId,
      academicYearId: leave.academicYearId,
      status: { $in: ['ENROLLED', 'ACTIVE'] },
      isCurrent: true,
    });
    if (!enrollment) {
      logger.warn(`Leave ${leave._id}: no current enrollment found for student ${leave.studentId}, skipping attendance sync.`);
      return { synced: 0, skipped: true };
    }

    const leaveStatus =
      (await AttendanceStatus.findOne({ schoolId, code: 'LEAVE', status: 'ACTIVE' })) ||
      (await AttendanceStatus.findOne({ schoolId, code: 'EXCUSED', status: 'ACTIVE' }));
    if (!leaveStatus) {
      logger.warn(`Leave ${leave._id}: school ${schoolId} has no ACTIVE LEAVE/EXCUSED attendance status configured, skipping attendance sync.`);
      return { synced: 0, skipped: true };
    }

    const days = [];
    const cursor = new Date(leave.fromDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(leave.toDate);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    let synced = 0;
    const fields = {
      statusId: leaveStatus._id,
      markedBy: actorId,
      markedAt: new Date(),
      remarks: `Approved leave${leave.reason ? `: ${leave.reason}` : ''}`,
      source: 'SYSTEM',
    };

    for (const date of days) {
      const existingDay = await AttendanceDay.findOne({
        schoolId, studentId: leave.studentId, date, academicYearId: leave.academicYearId,
      }).lean();

      const periodIds = existingDay?.periods?.length
        ? existingDay.periods.map((p) => p.periodId || null)
        : [null]; // no entries yet — create the DAILY-shaped placeholder

      for (const periodId of periodIds) {
        const result = await upsertPeriodEntry({
          schoolId,
          academicYearId: leave.academicYearId,
          date,
          attendanceType: existingDay?.attendanceType || 'DAILY',
          studentId: leave.studentId,
          enrollmentId: enrollment._id,
          gradeId: enrollment.gradeId,
          sectionId: enrollment.sectionId,
          periodId,
          fields,
        });
        if (result.outcome !== 'LOCKED') synced++;
      }
    }

    return { synced, skipped: false };
  } catch (error) {
    logger.error(`Failed to sync approved leave ${leave._id} to attendance: ${error.message}`);
    return { synced: 0, skipped: true, error: error.message };
  }
}

module.exports = { syncApprovedLeaveToAttendance };
