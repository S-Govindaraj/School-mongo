const mongoose = require('mongoose');

const studentLedgerSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear'
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  referenceType: {
    type: String,
    enum: ['INVOICE', 'PAYMENT', 'DISCOUNT', 'CONCESSION', 'FINE', 'REFUND', 'ADJUSTMENT', 'CREDIT', 'DEBIT', 'REVERSAL'],
    required: true
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  transactionType: {
    type: String,
    enum: ['DEBIT', 'CREDIT'],
    required: true
  },
  debit: {
    type: Number,
    default: 0
  },
  credit: {
    type: Number,
    default: 0
  },
  balance: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  transactionDate: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

studentLedgerSchema.index({ schoolId: 1, studentId: 1, transactionDate: 1 });

module.exports = mongoose.model('StudentLedger', studentLedgerSchema);
