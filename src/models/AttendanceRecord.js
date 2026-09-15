const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    attendanceSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    date: { type: Date, required: true },
    periodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Period' },
    statusId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceStatus', required: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    markedAt: { type: Date, default: Date.now },
    remarks: { type: String, trim: true, default: '' },
    source: { type: String, enum: ['MANUAL', 'BULK', 'IMPORT', 'SYSTEM'], default: 'MANUAL' },
  },
  { timestamps: true }
);

// Unique index to prevent duplicate student attendance in same session
attendanceRecordSchema.index(
  { schoolId: 1, attendanceSessionId: 1, studentId: 1 },
  { unique: true }
);

// Indexes for fast date and student resolution
attendanceRecordSchema.index({ schoolId: 1, studentId: 1, date: 1 });
attendanceRecordSchema.index({ schoolId: 1, academicYearId: 1, studentId: 1 });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
