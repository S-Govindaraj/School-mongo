const mongoose = require('mongoose');

const salaryComponentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION'],
      required: true,
    },
    calculationType: {
      type: String,
      enum: ['FIXED', 'PERCENTAGE', 'FORMULA'],
      required: true,
      default: 'FIXED',
    },
    value: {
      type: Number,
      default: 0,
    },
    percentageOf: {
      type: String, // Code of component, e.g. 'BASIC'
    },
    taxable: {
      type: Boolean,
      default: true,
    },
    affectsGross: {
      type: Boolean,
      default: true,
    },
    affectsNet: {
      type: Boolean,
      default: true,
    },
    recurring: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

salaryComponentSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('SalaryComponent', salaryComponentSchema);
