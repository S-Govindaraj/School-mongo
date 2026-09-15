const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    campusId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campus',
      index: true,
    },
    assetCode: {
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
    category: {
      type: String,
      default: 'GENERAL',
    },
    serialNumber: String,
    purchaseDate: String,
    purchasePrice: {
      type: Number,
      default: 0,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
    },
    warrantyStart: String,
    warrantyEnd: String,
    currentLocation: String,
    status: {
      type: String,
      enum: ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'LOST', 'DAMAGED', 'DISPOSED', 'RETIRED'],
      default: 'AVAILABLE',
      index: true,
    },
    condition: {
      type: String,
      enum: ['EXCELLENT', 'GOOD', 'FAIR', 'POOR'],
      default: 'EXCELLENT',
    },
    depreciationMethod: {
      type: String,
      enum: ['STRAIGHT_LINE', 'REDUCING_BALANCE', 'NONE'],
      default: 'STRAIGHT_LINE',
    },
    depreciationRate: {
      type: Number,
      default: 10,
    },
    usefulLife: Number, // Years
    residualValue: Number,
    assignedToType: {
      type: String,
      enum: ['STAFF', 'DEPARTMENT', 'ROOM', 'CAMPUS', 'NONE'],
      default: 'NONE',
    },
    assignedToId: mongoose.Schema.Types.ObjectId,
    notes: String,
  },
  { timestamps: true }
);

assetSchema.index({ schoolId: 1, assetCode: 1 }, { unique: true });
assetSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Asset', assetSchema);
