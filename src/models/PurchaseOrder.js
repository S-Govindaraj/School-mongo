const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    purchaseRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseRequest',
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
    },
    orderDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    expectedDeliveryDate: String,
    items: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'InventoryItem',
        },
        itemName: String,
        quantity: Number,
        unitPrice: Number,
        amount: Number,
      },
    ],
    subtotal: {
      type: Number,
      required: true,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      default: 0,
    },
    paymentTerms: String,
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'CLOSED'],
      default: 'SUBMITTED',
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ schoolId: 1, orderNumber: 1 }, { unique: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
