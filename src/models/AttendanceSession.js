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

attendanceSessionSchema.index({ schoolId: 1, academicYearId: 1, date: 1, sectionId: 1, attendanceType: 1 });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
