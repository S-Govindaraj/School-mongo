const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema(
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
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveType',
      required: true,
      index: true,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
      index: true,
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    accrued: {
      type: Number,
      default: 0,
    },
    used: {
      type: Number,
      default: 0,
    },
    pending: {
      type: Number,
      default: 0,
    },
    adjusted: {
      type: Number,
      default: 0,
    },
    closingBalance: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

leaveBalanceSchema.index(
  { schoolId: 1, staffId: 1, leaveTypeId: 1, academicYearId: 1 },
  { unique: true }
);

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);
