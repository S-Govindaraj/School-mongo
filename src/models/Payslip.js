const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema(
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
    employeeNumber: String,
    salarySnapshot: mongoose.Schema.Types.Mixed,
    earningsSnapshot: mongoose.Schema.Types.Mixed,
    deductionSnapshot: mongoose.Schema.Types.Mixed,
    grossAmount: Number,
    netAmount: Number,
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    publishedAt: Date,
    status: {
      type: String,
      enum: ['GENERATED', 'PUBLISHED', 'LOCKED'],
      default: 'GENERATED',
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
    },
  },
  { timestamps: true }
);

payslipSchema.index({ schoolId: 1, payrollPeriodId: 1, staffId: 1 }, { unique: true });

module.exports = mongoose.model('Payslip', payslipSchema);
