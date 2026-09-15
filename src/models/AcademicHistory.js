const mongoose = require('mongoose');

const academicHistorySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    promotionStatus: {
      type: String,
      enum: ['ENROLLED', 'PROMOTED', 'RETAINED', 'PASSED_OUT', 'WITHDRAWN'],
      default: 'ENROLLED',
    },
    remarks: { type: String, default: '' },
  },
  { timestamps: true }
);

academicHistorySchema.index({ schoolId: 1, studentId: 1 });

module.exports = mongoose.model('AcademicHistory', academicHistorySchema);
