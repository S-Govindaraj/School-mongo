const mongoose = require('mongoose');

const staffAttendanceSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
    },
    checkIn: String, // HH:mm
    checkOut: String, // HH:mm
    attendanceStatus: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF', 'WORK_FROM_HOME'],
      required: true,
      default: 'PRESENT',
    },
    lateMinutes: {
      type: Number,
      default: 0,
    },
    earlyLeaveMinutes: {
      type: Number,
      default: 0,
    },
    overtimeMinutes: {
      type: Number,
      default: 0,
    },
    remarks: String,
    source: {
      type: String,
      enum: ['MANUAL', 'BIOMETRIC', 'MOBILE_APP', 'SYSTEM'],
      default: 'MANUAL',
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

staffAttendanceSchema.index({ schoolId: 1, staffId: 1, date: 1 }, { unique: true });
staffAttendanceSchema.index({ schoolId: 1, date: 1, attendanceStatus: 1 });

module.exports = mongoose.model('StaffAttendance', staffAttendanceSchema);
