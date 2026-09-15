const mongoose = require('mongoose');

const gatePassSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    passNumber: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['STUDENT', 'STAFF', 'MATERIAL'],
      required: true,
      index: true,
    },
    requesterType: {
      type: String,
      enum: ['STUDENT', 'STAFF', 'OTHER'],
      default: 'STUDENT',
    },
    requesterId: mongoose.Schema.Types.ObjectId,
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
    },
    reason: {
      type: String,
      required: true,
    },
    destination: String,
    expectedReturn: String,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    issuedAt: Date,
    returnedAt: Date,
    status: {
      type: String,
      enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'ISSUED', 'RETURNED', 'EXPIRED', 'CANCELLED'],
      default: 'REQUESTED',
      index: true,
    },
  },
  { timestamps: true }
);

gatePassSchema.index({ schoolId: 1, passNumber: 1 }, { unique: true });
gatePassSchema.index({ schoolId: 1, type: 1, status: 1 });

module.exports = mongoose.model('GatePass', gatePassSchema);
