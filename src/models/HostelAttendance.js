const mongoose = require('mongoose');

const hostelAttendanceSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    hostelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hostel',
      required: true,
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    allocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HostelAllocation',
      required: true,
    },
    status: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'OUT_PASS', 'LEAVE', 'LATE'],
      required: true,
      default: 'PRESENT',
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
    remarks: String,
  },
  { timestamps: true }
);

hostelAttendanceSchema.index({ schoolId: 1, hostelId: 1, date: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('HostelAttendance', hostelAttendanceSchema);
