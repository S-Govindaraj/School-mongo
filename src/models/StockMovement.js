const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true,
      index: true,
    },
    movementType: {
      type: String,
      enum: ['PURCHASE', 'RECEIPT', 'ISSUE', 'TRANSFER', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'LOSS', 'DISPOSAL'],
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    unitCost: {
      type: Number,
      default: 0,
    },
    referenceType: String,
    referenceId: mongoose.Schema.Types.ObjectId,
    batchNumber: String,
    serialNumber: String,
    expiryDate: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reason: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

stockMovementSchema.index({ schoolId: 1, warehouseId: 1, itemId: 1 });
stockMovementSchema.index({ schoolId: 1, movementType: 1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
