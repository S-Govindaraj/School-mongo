const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryCategory',
      required: true,
      index: true,
    },
    itemCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    unit: {
      type: String,
      default: 'PCS',
    },
    reorderLevel: {
      type: Number,
      default: 10,
    },
    reorderQuantity: {
      type: Number,
      default: 50,
    },
    trackSerialNumber: {
      type: Boolean,
      default: false,
    },
    trackBatch: {
      type: Boolean,
      default: false,
    },
    expiryTracking: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

inventoryItemSchema.index({ schoolId: 1, itemCode: 1 }, { unique: true });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
