const mongoose = require('mongoose');

const feeConcessionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: ['PERCENTAGE', 'FIXED_AMOUNT'], required: true },
    value: { type: Number, required: true, min: 0 },
    applicableFeeCategoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory' }],
    maximumAmount: { type: Number, default: 0 },
    validFrom: { type: Date, default: Date.now },
    validTo: { type: Date },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
      default: 'PENDING',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

feeConcessionSchema.index({ schoolId: 1, studentId: 1, academicYearId: 1 });

module.exports = mongoose.model('FeeConcession', feeConcessionSchema);
