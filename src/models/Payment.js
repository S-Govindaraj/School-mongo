const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    paymentNumber: { type: String, required: true, trim: true },
    paymentDate: { type: Date, default: Date.now, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', uppercase: true },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'ONLINE', 'OTHER'],
      default: 'CASH',
    },
    referenceNumber: { type: String, trim: true, default: '' },
    gatewayTransactionId: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
      default: 'SUCCESS',
      index: true,
    },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, default: '' },
    idempotencyKey: { type: String, trim: true, required: true },
  },
  { timestamps: true }
);

paymentSchema.index({ schoolId: 1, paymentNumber: 1 }, { unique: true });
paymentSchema.index({ schoolId: 1, idempotencyKey: 1 }, { unique: true });
// Student payment history — most common query in finance dashboard
paymentSchema.index({ schoolId: 1, studentId: 1, paymentDate: -1 });
paymentSchema.index({ schoolId: 1, status: 1, paymentDate: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
