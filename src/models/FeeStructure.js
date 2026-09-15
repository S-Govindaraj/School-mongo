const mongoose = require('mongoose');

const feeStructureSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, trim: true, default: '' },
    applicableTo: {
      type: String,
      enum: ['ALL_GRADES', 'SPECIFIC_GRADES', 'SPECIFIC_SECTIONS', 'GRADE_LEVEL', 'ALL_STUDENTS'],
      default: 'ALL_GRADES'
    },
    gradeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Grade' }],
    sectionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Section' }],
    effectiveFrom: { type: Date },
    effectiveTo: { type: Date },
    billingFrequency: {
      type: String,
      enum: ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'],
      default: 'MONTHLY',
    },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

feeStructureSchema.index({ schoolId: 1, academicYearId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('FeeStructure', feeStructureSchema);
