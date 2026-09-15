const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    code: {
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
    startTime: {
      type: String, // HH:mm
      required: true,
    },
    endTime: {
      type: String, // HH:mm
      required: true,
    },
    graceMinutes: {
      type: Number,
      default: 15,
    },
    minimumWorkingMinutes: {
      type: Number,
      default: 480,
    },
    overtimeAllowed: {
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

shiftSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Shift', shiftSchema);
