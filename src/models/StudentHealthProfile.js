const mongoose = require('mongoose');

const studentHealthProfileSchema = new mongoose.Schema(
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
    bloodGroup: String,
    allergies: [String],
    chronicConditions: [String],
    emergencyNotes: String,
    medicalAlerts: [String],
    doctorName: String,
    doctorPhone: String,
  },
  { timestamps: true }
);

studentHealthProfileSchema.index({ schoolId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('StudentHealthProfile', studentHealthProfileSchema);
