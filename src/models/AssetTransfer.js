const mongoose = require('mongoose');

const assetTransferSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: true,
      index: true,
    },
    fromLocation: String,
    toLocation: String,
    transferredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    transferDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    reason: String,
    status: {
      type: String,
      enum: ['COMPLETED', 'PENDING', 'CANCELLED'],
      default: 'COMPLETED',
    },
  },
  { timestamps: true }
);

assetTransferSchema.index({ schoolId: 1, assetId: 1 });

module.exports = mongoose.model('AssetTransfer', assetTransferSchema);
