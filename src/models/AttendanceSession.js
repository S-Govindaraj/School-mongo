const mongoose = require('mongoose');

const attendanceSessionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    date: { type: Date, required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    periodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Period' }, // Optional for DAILY mode
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    attendanceType: { type: String, enum: ['DAILY', 'PERIOD'], default: 'DAILY' },
    status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'LOCKED', 'ARCHIVED'], default: 'SUBMITTED' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: Date.now },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Unique (excluding ARCHIVED sessions, via partialFilterExpression so an
// archived slot can be re-created) — closes the race where two concurrent
// first-time mark-bulk/createAttendanceSession calls for the same
// section/day/period/type could each create their own session, and
// (downstream) duplicate per-student records. Includes periodId, which the
// previous non-unique version of this index omitted. attendanceController.js
// now upserts against this exact key via findOneAndUpdate.
attendanceSessionSchema.index(
  { schoolId: 1, academicYearId: 1, date: 1, sectionId: 1, periodId: 1, attendanceType: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: 'ARCHIVED' } } }
);
// Session lookup also queries by gradeId for daily summaries
attendanceSessionSchema.index({ schoolId: 1, gradeId: 1, date: 1 });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema, 'attendanceSessions');
