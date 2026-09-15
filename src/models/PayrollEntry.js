const mongoose = require('mongoose');

const payrollEntrySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    payrollPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollPeriod',
      required: true,
      index: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
      index: true,
    },
    workingDays: {
      type: Number,
      default: 30,
    },
    paidDays: {
      type: Number,
      default: 30,
    },
    unpaidDays: {
      type: Number,
      default: 0,
    },
    overtimeHours: {
      type: Number,
      default: 0,
    },
    earnings: [
      {
        code: String,
        name: String,
        amount: Number,
      },
    ],
    deductions: [
      {
        code: String,
        name: String,
        amount: Number,
      },
    ],
    employerContributions: [
      {
        code: String,
        name: String,
        amount: Number,
      },
    ],
    grossAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    netAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PROCESSED', 'APPROVED', 'LOCKED'],
      default: 'PROCESSED',
    },
    calculationSnapshot: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

payrollEntrySchema.index({ schoolId: 1, payrollPeriodId: 1, staffId: 1 }, { unique: true });

module.exports = mongoose.model('PayrollEntry', payrollEntrySchema);
