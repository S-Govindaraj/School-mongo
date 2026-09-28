const AttendanceDay = require('../models/AttendanceDay');

/**
 * Shared write helper for the single-collection attendance model. Every
 * write path (bulk mark, leave sync, mobile offline sync) goes through this
 * instead of hand-rolling its own upsert, so "how do we safely write one
 * period entry" has exactly one implementation.
 *
 * Concurrency model: contention is expected to be low (one teacher marking
 * their own roster, or a student's own day being corrected) — NOT two
 * teachers racing to write the exact same student+day+period at the same
 * instant. Given that, this uses an arrayFilters positional update for the
 * common "entry already exists" case (atomic, single round trip), and falls
 * back to a $push-with-upsert guarded by `periods.periodId: { $ne }` when no
 * entry exists yet. That guard prevents most duplicate-push races, but a
 * true simultaneous first-write for a brand-new period slot could still
 * produce two entries in a rare worst case — accepted trade-off documented
 * in the migration plan, not solved with a full CAS/retry loop here.
 *
 * Returns one of:
 *   { outcome: 'UPDATED', dayId }  — an existing period entry was updated
 *   { outcome: 'CREATED', dayId }  — a new period entry (and possibly the
 *                                     parent day doc) was created
 *   { outcome: 'LOCKED' }          — the target entry exists but is LOCKED;
 *                                     caller must reject the write
 */
async function upsertPeriodEntry({
  schoolId,
  academicYearId,
  date,
  attendanceType,
  studentId,
  enrollmentId,
  gradeId,
  sectionId,
  periodId,
  fields,
}) {
  const normalizedPeriodId = periodId || null;
  const setFields = {};
  Object.entries(fields).forEach(([key, value]) => {
    setFields[`periods.$[p].${key}`] = value;
  });

  // Matched nothing below — either the entry doesn't exist yet, or it exists
  // but is LOCKED. Distinguish the two before falling back to a $push.
  const existingDay = await AttendanceDay.findOne({ schoolId, studentId, date, academicYearId })
    .select('periods')
    .lean();
  const existingEntry = existingDay?.periods?.find(
    (p) => String(p.periodId || '') === String(normalizedPeriodId || '')
  );

  if (existingEntry) {
    if (existingEntry.sessionStatus === 'LOCKED') {
      return { outcome: 'LOCKED' };
    }
    await AttendanceDay.updateOne(
      { schoolId, studentId, date, academicYearId },
      { $set: setFields },
      { arrayFilters: [{ 'p.periodId': normalizedPeriodId }] }
    );
    return { outcome: 'UPDATED', dayId: existingDay._id };
  }

  const created = await AttendanceDay.findOneAndUpdate(
    {
      schoolId,
      studentId,
      date,
      academicYearId,
      'periods.periodId': { $ne: normalizedPeriodId },
    },
    {
      $setOnInsert: { schoolId, academicYearId, date, attendanceType, studentId, enrollmentId, gradeId, sectionId },
      $push: { periods: { periodId: normalizedPeriodId, sessionStatus: 'SUBMITTED', ...fields } },
    },
    { upsert: true, setDefaultsOnInsert: true, new: true }
  );

  return { outcome: 'CREATED', dayId: created._id };
}

/** Reads one student's full day (all periods), or null if nothing marked yet. */
async function getAttendanceDay({ schoolId, studentId, date, academicYearId }) {
  return AttendanceDay.findOne({ schoolId, studentId, date, academicYearId })
    .populate('periods.periodId', 'name code sequence startTime endTime')
    .populate('periods.statusId', 'name code countsAsPresent countsAsAbsent colorToken')
    .populate('periods.markedBy', 'name email')
    .populate('periods.teacherId', 'firstName lastName')
    .lean();
}

/**
 * Flattens a list of AttendanceDay docs (already populated on
 * periods.statusId, at minimum) into one row per MARKED period entry,
 * shaped like the old flat AttendanceRecord rows — {_id, date, statusId,
 * remarks, attendanceDayId, periodEntryId, sectionId, gradeId, studentId}.
 * Used by every read path that used to consume a flat AttendanceRecord list
 * (portals, Student-360) so their existing per-record rendering logic keeps
 * working unchanged. Sorted newest-first by date, matching the old
 * `.sort({date:-1})` convention; a multi-period day contributes multiple
 * rows sharing the same date.
 */
function flattenPeriodsToRecords(days) {
  const rows = [];
  for (const day of days) {
    for (const entry of day.periods || []) {
      if (!entry.statusId) continue; // unmarked placeholder (e.g. LOCKED-empty) — not a real record
      rows.push({
        _id: entry._id,
        id: String(entry._id),
        date: day.date,
        statusId: entry.statusId,
        remarks: entry.remarks || '',
        periodId: entry.periodId || null,
        sessionStatus: entry.sessionStatus,
        attendanceDayId: day._id,
        periodEntryId: entry._id,
        studentId: day.studentId,
        academicYearId: day.academicYearId,
        gradeId: day.gradeId,
        sectionId: day.sectionId,
      });
    }
  }
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  return rows;
}

module.exports = { upsertPeriodEntry, getAttendanceDay, flattenPeriodsToRecords };
