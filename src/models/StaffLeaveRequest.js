const mongoose = require('mongoose');

const staffLeaveRequestSchema = new mongoose.Schema(
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
    startDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    endDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    numberOfDays: {
      type: Number,
      required: true,
    },
    halfDay: {
      type: Boolean,
      default: false,
    },
    reason: {
      type: String,
      required: true,
    },
    attachmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'SUBMITTED',
      index: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    rejectionReason: String,
  },
  { timestamps: true }
);

staffLeaveRequestSchema.index({ schoolId: 1, staffId: 1, startDate: 1 });
staffLeaveRequestSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('StaffLeaveRequest', staffLeaveRequestSchema);
