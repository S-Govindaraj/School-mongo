const mongoose = require('mongoose');

const hostelAllocationSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
      index: true,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
      index: true,
    },
    hostelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hostel',
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HostelRoom',
      required: true,
    },
    bedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HostelBed',
      required: true,
      index: true,
    },
    allocationDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    vacatedDate: String,
    status: {
      type: String,
      enum: ['ACTIVE', 'VACATED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    remarks: String,
  },
  { timestamps: true }
);

hostelAllocationSchema.index({ schoolId: 1, bedId: 1, status: 1 });
hostelAllocationSchema.index({ schoolId: 1, studentId: 1, academicYearId: 1 });

module.exports = mongoose.model('HostelAllocation', hostelAllocationSchema);
