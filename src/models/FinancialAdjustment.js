const mongoose = require('mongoose');

const financialAdjustmentSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear'
  },
  type: {
    type: String,
    enum: ['DEBIT', 'CREDIT', 'FEE_WAIVER', 'MANUAL_CORRECTION', 'ROUNDING_CORRECTION'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  referenceType: {
    type: String,
    default: 'MANUAL'
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'APPROVED'
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  }
}, { timestamps: true });

financialAdjustmentSchema.index({ schoolId: 1, referenceType: 1, referenceId: 1 });

module.exports = mongoose.model('FinancialAdjustment', financialAdjustmentSchema);
