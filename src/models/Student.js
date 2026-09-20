const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentNumber: { type: String, required: true, trim: true },
    admissionNumber: { type: String, required: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true, default: '' },
    lastName: { type: String, required: true, trim: true },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'], default: 'UNKNOWN' },
    nationality: { type: String, trim: true, default: 'Indian' },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: '' },
    },
    photo: { type: String, default: '' },
    status: {
      type: String,
      enum: ['APPLICANT', 'ADMITTED', 'ACTIVE', 'PROMOTED', 'GRADUATED', 'ALUMNI', 'WITHDRAWN', 'TRANSFERRED', 'SUSPENDED', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
    },
    admissionDate: { type: Date, default: Date.now },
    previousSchool: { type: String, trim: true, default: '' },
    emergencyContact: {
      name: { type: String, default: '' },
      relationship: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

studentSchema.index({ schoolId: 1, studentNumber: 1 }, { unique: true });
studentSchema.index({ schoolId: 1, admissionNumber: 1 }, { unique: true });
studentSchema.index({ schoolId: 1, status: 1 });
// Full-text search support for the name/phone/email search in getStudents
studentSchema.index({ schoolId: 1, firstName: 1, lastName: 1 });
studentSchema.index({ schoolId: 1, createdAt: -1 }); // default sort column

module.exports = mongoose.model('Student', studentSchema);
