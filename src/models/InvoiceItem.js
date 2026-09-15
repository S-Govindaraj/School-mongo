const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    feeCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory', required: true, index: true },
    feeStructureItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructureItem' },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    unitAmount: { type: Number, required: true, min: 0 },
    grossAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    concessionAmount: { type: Number, default: 0, min: 0 },
    fineAmount: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    sequence: { type: Number, default: 1 },
  },
  { timestamps: true }
);

invoiceItemSchema.index({ schoolId: 1, invoiceId: 1 });

module.exports = mongoose.model('InvoiceItem', invoiceItemSchema);
