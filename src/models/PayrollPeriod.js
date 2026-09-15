const mongoose = require('mongoose');

const payrollPeriodSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
    },
    month: {
      type: Number, // 1 - 12
      required: true,
    },
    startDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    endDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PROCESSING', 'PROCESSED', 'APPROVED', 'LOCKED', 'CANCELLED'],
      default: 'DRAFT',
      index: true,
    },
    processedAt: Date,
    lockedAt: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

payrollPeriodSchema.index({ schoolId: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('PayrollPeriod', payrollPeriodSchema);
