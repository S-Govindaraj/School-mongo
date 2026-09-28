const mongoose = require('mongoose');

/**
 * One entry per period within a student's day. DAILY-mode schools use a
 * single synthetic entry with periodId: null — one uniform shape for both
 * modes, so the roster/View/Edit/lock code never branches on attendanceType
 * to decide how to read a status.
 *
 * `sessionStatus` (lock state) lives HERE, per period entry, not on the
 * parent AttendanceDay — a PERIOD-mode day can have period 1 LOCKED while
 * period 3 is still DRAFT. Locking "a section's day" is an updateMany across
 * every student's document for that section/date, targeting the matching
 * entry via arrayFilters (see attendanceController.js setSessionLock) —
 * this is NOT a single-document atomic operation like the old per-session
 * lock, by design (see ATTENDANCE_MIGRATION notes).
 */
const periodEntrySchema = new mongoose.Schema(
  {
    periodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Period', default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    statusId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceStatus', default: null },
    remarks: { type: String, trim: true, default: '' },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    markedAt: { type: Date, default: null },
    source: { type: String, enum: ['MANUAL', 'BULK', 'IMPORT', 'SYSTEM'], default: 'MANUAL' },
    sessionStatus: { type: String, enum: ['DRAFT', 'SUBMITTED', 'LOCKED', 'ARCHIVED'], default: 'DRAFT' },
  },
  { _id: true, timestamps: false }
);

const attendanceDaySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    date: { type: Date, required: true },
    // Fixed per section/day — a section doesn't mix DAILY and PERIOD marking
    // on the same calendar day. Denormalized here (not just implied by the
    // periods array) so queries can filter on it directly.
    attendanceType: { type: String, enum: ['DAILY', 'PERIOD'], required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    periods: { type: [periodEntrySchema], default: [] },
  },
  { timestamps: true }
);

// One document per student per day — the core invariant this whole model
// replaces AttendanceSession+AttendanceRecord's two-collection design with.
attendanceDaySchema.index(
  { schoolId: 1, academicYearId: 1, studentId: 1, date: 1 },
  { unique: true }
);
// Section+date roster — the single hottest query (roster table, section
// lock, section summary).
attendanceDaySchema.index({ schoolId: 1, sectionId: 1, date: 1 });
// Dependency checks (delete guards) and school-wide daily summaries.
attendanceDaySchema.index({ schoolId: 1, gradeId: 1, sectionId: 1, academicYearId: 1, date: 1 });
// Student history — student summary, Student-360, parent/student portals.
attendanceDaySchema.index({ schoolId: 1, studentId: 1, date: -1 });
attendanceDaySchema.index({ schoolId: 1, academicYearId: 1, studentId: 1 });
// Analytics date-range scans.
attendanceDaySchema.index({ schoolId: 1, date: 1 });

module.exports = mongoose.model('AttendanceDay', attendanceDaySchema, 'attendanceDays');
