const mongoose = require('mongoose');

const medicalVisitSchema = new mongoose.Schema(
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
    visitDate: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
    },
    symptoms: String,
    observation: String,
    actionTaken: String,
    referredTo: String,
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

medicalVisitSchema.index({ schoolId: 1, studentId: 1, visitDate: 1 });

module.exports = mongoose.model('MedicalVisit', medicalVisitSchema);
