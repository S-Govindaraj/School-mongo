const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema(
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
    description: String,
    annualQuota: {
      type: Number,
      required: true,
      default: 12,
    },
    carryForwardAllowed: {
      type: Boolean,
      default: false,
    },
    maxCarryForward: {
      type: Number,
      default: 0,
    },
    requiresDocument: {
      type: Boolean,
      default: false,
    },
    requiresApproval: {
      type: Boolean,
      default: true,
    },
    paid: {
      type: Boolean,
      default: true,
    },
    halfDayAllowed: {
      type: Boolean,
      default: true,
    },
    applicableCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EmployeeCategory',
      },
    ],
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

leaveTypeSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
