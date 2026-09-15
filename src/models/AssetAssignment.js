const mongoose = require('mongoose');

const assetAssignmentSchema = new mongoose.Schema(
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
    assignedToType: {
      type: String,
      enum: ['STAFF', 'DEPARTMENT', 'ROOM', 'CAMPUS'],
      required: true,
    },
    assignedToId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    assignedDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    returnedDate: String,
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'RETURNED'],
      default: 'ACTIVE',
    },
    remarks: String,
  },
  { timestamps: true }
);

assetAssignmentSchema.index({ schoolId: 1, assetId: 1, status: 1 });

module.exports = mongoose.model('AssetAssignment', assetAssignmentSchema);
