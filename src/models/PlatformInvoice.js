const mongoose = require('mongoose');

const platformInvoiceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true },
    invoiceNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'],
      default: 'OPEN',
      index: true,
    },
    billingPeriod: {
      start: Date,
      end: Date,
    },
    lineItems: [
      {
        description: String,
        quantity: Number,
        unitPrice: Number,
        amount: Number,
        type: { type: String, enum: ['SUBSCRIPTION', 'ADDON', 'USAGE', 'CREDIT', 'TAX'] },
      }
    ],
    subtotal: { type: Number, required: true, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    total: { type: Number, required: true, default: 0 },
    currency: { type: String, default: 'USD' },
    dueDate: Date,
    paidAt: Date,
    paymentMethod: String,
    paymentReference: String,
    pdfUrl: String,
    notes: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

platformInvoiceSchema.index({ schoolId: 1, status: 1 });
platformInvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
platformInvoiceSchema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.model('PlatformInvoice', platformInvoiceSchema);
