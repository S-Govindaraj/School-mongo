const mongoose = require('mongoose');

const assignedItemSnapshotSchema = new mongoose.Schema(
  {
    feeStructureItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructureItem' },
    feeCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory' },
    name: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 }, // Snapshotted amount
    frequency: { type: String, default: 'MONTHLY' },
    isMandatory: { type: Boolean, default: true },
  },
  { _id: false }
);

const studentFeeAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true, index: true },
    feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure', required: true, index: true },
    assignedItems: [assignedItemSnapshotSchema],
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'CANCELLED'], default: 'ACTIVE' },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

studentFeeAssignmentSchema.index({ schoolId: 1, academicYearId: 1, studentId: 1, feeStructureId: 1 });

module.exports = mongoose.model('StudentFeeAssignment', studentFeeAssignmentSchema);
