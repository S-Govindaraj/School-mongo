const mongoose = require('mongoose');

const studentGuardianSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    guardianId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guardian', required: true },
    relationship: { type: String, enum: ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'], required: true },
    isPrimary: { type: Boolean, default: false },
    isEmergencyContact: { type: Boolean, default: false },
  },
  { timestamps: true }
);

studentGuardianSchema.index({ schoolId: 1, studentId: 1, guardianId: 1 }, { unique: true });

module.exports = mongoose.model('StudentGuardian', studentGuardianSchema);
