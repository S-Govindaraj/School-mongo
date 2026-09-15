const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ARCHIVED'],
      default: 'PENDING',
    },
    requestedBy: { type: String, trim: true, default: 'PARENT' }, // PARENT, GUARDIAN, STUDENT, ADMIN
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    remarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ schoolId: 1, studentId: 1, fromDate: 1 });
leaveRequestSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
