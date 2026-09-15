const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true, index: true },
    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, default: Date.now, required: true },
    dueDate: { type: Date, required: true },
    billingPeriod: { type: String, required: true, trim: true }, // e.g. '2026-09' or 'Q3-2026' or 'ANNUAL-2026'
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    concessionAmount: { type: Number, default: 0, min: 0 },
    fineAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    balanceAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID'],
      default: 'ISSUED',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

invoiceSchema.index({ schoolId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ schoolId: 1, academicYearId: 1, studentId: 1, dueDate: 1 });
invoiceSchema.index({ schoolId: 1, academicYearId: 1, studentId: 1, billingPeriod: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
