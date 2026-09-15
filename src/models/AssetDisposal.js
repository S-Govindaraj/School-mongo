const mongoose = require('mongoose');

const assetDisposalSchema = new mongoose.Schema(
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
    disposalDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    disposalMethod: {
      type: String,
      enum: ['SCRAPPED', 'SOLD', 'DONATED', 'DESTROYED', 'OTHER'],
      default: 'SCRAPPED',
    },
    disposalValue: {
      type: Number,
      default: 0,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    remarks: String,
    status: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'APPROVED',
    },
  },
  { timestamps: true }
);

assetDisposalSchema.index({ schoolId: 1, assetId: 1 }, { unique: true });

module.exports = mongoose.model('AssetDisposal', assetDisposalSchema);
