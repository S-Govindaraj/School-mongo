const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    rollNumber: { type: String, trim: true, default: '' },
    enrollmentDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['ENROLLED', 'ACTIVE', 'PROMOTED', 'RETAINED', 'GRADUATED', 'WITHDRAWN', 'TRANSFERRED', 'COMPLETED', 'INACTIVE', 'ARCHIVED'],
      default: 'ENROLLED',
    },
    isCurrent: { type: Boolean, default: true },
  },
  { timestamps: true }
);

enrollmentSchema.index({ schoolId: 1, studentId: 1, academicYearId: 1 });
enrollmentSchema.index({ schoolId: 1, academicYearId: 1, gradeId: 1, sectionId: 1 });
// isCurrent queries are the hottest path — used in every student list and attendance fetch
enrollmentSchema.index({ schoolId: 1, isCurrent: 1, studentId: 1 });
enrollmentSchema.index({ schoolId: 1, isCurrent: 1, gradeId: 1, sectionId: 1 });
enrollmentSchema.index({ schoolId: 1, isCurrent: 1, academicYearId: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
