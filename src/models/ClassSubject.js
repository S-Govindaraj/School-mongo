const mongoose = require('mongoose');

const classSubjectSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    isMandatory: { type: Boolean, default: true },
    isElective: { type: Boolean, default: false },
    subjectGroup: { type: String, trim: true, default: '' },
    weeklyPeriods: { type: Number, min: 1, max: 50, default: 5 },
    passMarks: { type: Number, min: 0, default: 35 },
    maxMarks: { type: Number, min: 1, default: 100 },
    theoryMarks: { type: Number, min: 0 },
    practicalMarks: { type: Number, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'INACTIVE' },
  },
  { timestamps: true }
);

classSubjectSchema.pre('validate', function (next) {
  if (this.passMarks > this.maxMarks) {
    return next(new Error('Pass marks cannot be greater than max marks.'));
  }
  if (this.theoryMarks !== undefined && this.practicalMarks !== undefined) {
    if (this.theoryMarks + this.practicalMarks !== this.maxMarks) {
      return next(new Error('Sum of theory marks and practical marks must equal max marks.'));
    }
  }
  if (this.isElective && (!this.subjectGroup || !this.subjectGroup.trim())) {
    return next(new Error('Elective group is required for elective subjects.'));
  }
  next();
});

classSubjectSchema.index({ schoolId: 1, academicYearId: 1, gradeId: 1, subjectId: 1 }, { unique: true });

module.exports = mongoose.model('ClassSubject', classSubjectSchema);
