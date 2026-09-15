const mongoose = require('mongoose');

const paymentAllocationSchema = new mongoose.Schema({
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
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  allocatedAmount: {
    type: Number,
    required: true,
    min: 0
  },
  allocationDate: {
    type: Date,
    default: Date.now
  },
  allocatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

paymentAllocationSchema.index({ schoolId: 1, paymentId: 1, invoiceId: 1 }, { unique: true });

module.exports = mongoose.model('PaymentAllocation', paymentAllocationSchema);
