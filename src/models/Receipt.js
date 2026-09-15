const mongoose = require('mongoose');

const allocatedInvoiceSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },
  invoiceNumber: {
    type: String,
    required: true
  },
  allocatedAmount: {
    type: Number,
    required: true
  }
}, { _id: false });

const receiptSchema = new mongoose.Schema({
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
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    index: true
  },
  receiptNumber: {
    type: String,
    required: true,
    trim: true
  },
  receiptDate: {
    type: Date,
    default: Date.now
  },
  amount: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    required: true
  },
  referenceNumber: {
    type: String,
    default: ''
  },
  allocatedInvoices: [allocatedInvoiceSchema],
  status: {
    type: String,
    enum: ['ISSUED', 'VOID', 'CANCELLED'],
    default: 'ISSUED'
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

receiptSchema.index({ schoolId: 1, receiptNumber: 1 }, { unique: true });

module.exports = mongoose.model('Receipt', receiptSchema);
