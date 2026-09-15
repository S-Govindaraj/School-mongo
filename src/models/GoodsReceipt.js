const mongoose = require('mongoose');

const goodsReceiptSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    receiptNumber: {
      type: String,
      required: true,
      trim: true,
    },
    receivedDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    items: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'InventoryItem',
        },
        quantityReceived: Number,
        unitCost: Number,
      },
    ],
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    remarks: String,
    status: {
      type: String,
      enum: ['RECEIVED', 'VERIFIED', 'CANCELLED'],
      default: 'RECEIVED',
    },
  },
  { timestamps: true }
);

goodsReceiptSchema.index({ schoolId: 1, receiptNumber: 1 }, { unique: true });

module.exports = mongoose.model('GoodsReceipt', goodsReceiptSchema);
