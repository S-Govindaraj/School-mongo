const mongoose = require('mongoose');

const admissionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    applicationNumber: { type: String, required: true, trim: true },
    applicationDate: { type: Date, default: Date.now },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    studentData: {
      firstName: { type: String, required: true, trim: true },
      middleName: { type: String, trim: true, default: '' },
      lastName: { type: String, required: true, trim: true },
      dob: { type: Date, required: true },
      gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
      bloodGroup: { type: String, default: 'UNKNOWN' },
      nationality: { type: String, default: 'Indian' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      address: {
        street: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        postalCode: { type: String, default: '' },
        country: { type: String, default: '' },
      },
      previousSchool: { type: String, default: '' },
    },
    guardianData: [
      {
        name: { type: String, required: true },
        relationship: { type: String, enum: ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'], required: true },
        phone: { type: String, required: true },
        email: { type: String, default: '' },
        occupation: { type: String, default: '' },
        isPrimary: { type: Boolean, default: false },
        isEmergencyContact: { type: Boolean, default: false },
      },
    ],
    status: {
      type: String,
      enum: ['APPLICATION', 'UNDER_REVIEW', 'APPROVED', 'ADMITTED', 'ENROLLED', 'REJECTED', 'ARCHIVED'],
      default: 'APPLICATION',
    },
    documents: [
      {
        documentType: { type: String, default: 'OTHER' },
        fileName: { type: String, default: '' },
        fileUrl: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    notes: { type: String, default: '' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvalDate: { type: Date },
    rejectionReason: { type: String, default: '' },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  },
  { timestamps: true }
);

admissionSchema.index({ schoolId: 1, applicationNumber: 1 }, { unique: true });
admissionSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Admission', admissionSchema);
