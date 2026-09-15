const mongoose = require('mongoose');

const assetMaintenanceSchema = new mongoose.Schema(
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
    maintenanceType: {
      type: String,
      enum: ['PREVENTIVE', 'CORRECTIVE', 'AMC', 'WARRANTY'],
      default: 'CORRECTIVE',
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
    },
    serviceDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    nextServiceDate: String,
    cost: {
      type: Number,
      default: 0,
    },
    description: String,
    status: {
      type: String,
      enum: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'COMPLETED',
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
    },
  },
  { timestamps: true }
);

assetMaintenanceSchema.index({ schoolId: 1, assetId: 1 });

module.exports = mongoose.model('AssetMaintenance', assetMaintenanceSchema);
