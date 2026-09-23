const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    academicTermId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm' },
    title: { type: String, required: true, trim: true },
    examType: {
      type: String,
      enum: ['UNIT_TEST', 'MID_TERM', 'FINAL', 'PROJECT', 'PRACTICAL'],
      default: 'MID_TERM',
    },
    description: { type: String, default: '' },
    gradeIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Grade' }],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one grade is required.',
      },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'RESULTS_PENDING', 'RESULTS_READY', 'PUBLISHED', 'LOCKED'],
      default: 'DRAFT',
    },
    // Phase 2 (Tranche 2a): this exam's weight when aggregated into a
    // term-weighted report card (see services/reportCardService.js). Unset
    // means "no weight configured" — the aggregation service treats that as
    // an equal-weight fallback, NEVER as weight=0.
    weightPercent: { type: Number, min: 0, max: 100 },
    publishedAt: { type: Date },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lockedAt: { type: Date },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

examSchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error('End date cannot be before start date.'));
  }
  next();
});

examSchema.index({ schoolId: 1, academicYearId: 1, status: 1 });
examSchema.index({ schoolId: 1, status: 1, startDate: 1 });

module.exports = mongoose.model('Exam', examSchema);
