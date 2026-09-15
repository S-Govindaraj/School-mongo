const mongoose = require('mongoose');

const hostelBedSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HostelRoom',
      required: true,
      index: true,
    },
    bedNumber: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'ALLOCATED', 'MAINTENANCE', 'BLOCKED'],
      default: 'AVAILABLE',
      index: true,
    },
  },
  { timestamps: true }
);

hostelBedSchema.index({ schoolId: 1, roomId: 1, bedNumber: 1 }, { unique: true });

module.exports = mongoose.model('HostelBed', hostelBedSchema);
