const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema(
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
    quantity: {
      type: Number,
      default: 0,
    },
    reservedQuantity: {
      type: Number,
      default: 0,
    },
    availableQuantity: {
      type: Number,
      default: 0,
    },
    reorderLevel: {
      type: Number,
      default: 10,
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

stockSchema.index({ schoolId: 1, warehouseId: 1, itemId: 1 }, { unique: true });

module.exports = mongoose.model('Stock', stockSchema);
