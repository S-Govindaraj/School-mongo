const mongoose = require('mongoose');

const hostelSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ['BOYS', 'GIRLS', 'MIXED'],
      default: 'BOYS',
    },
    gender: {
      type: String,
      enum: ['MALE', 'FEMALE', 'ALL'],
      default: 'ALL',
    },
    capacity: {
      type: Number,
      required: true,
      default: 50,
    },
    wardenStaffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
    },
    address: String,
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

hostelSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Hostel', hostelSchema);
