const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  refundNumber: {
    type: String,
    required: true,
    trim: true
  },
  refundAmount: {
    type: Number,
    required: true,
    min: 0
  },
  refundDate: {
    type: Date,
    default: Date.now
  },
  refundMethod: {
    type: String,
    default: 'BANK_TRANSFER'
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED', 'CANCELLED'],
    default: 'REQUESTED'
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
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date
  }
}, { timestamps: true });

refundSchema.index({ schoolId: 1, refundNumber: 1 }, { unique: true });

module.exports = mongoose.model('Refund', refundSchema);
