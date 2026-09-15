const mongoose = require('mongoose');

const studentDocumentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission' },
    documentType: {
      type: String,
      enum: ['BIRTH_CERTIFICATE', 'TRANSFER_CERTIFICATE', 'PREVIOUS_MARKSHEET', 'NATIONAL_ID', 'STUDENT_PHOTO', 'MEDICAL_RECORD', 'OTHER'],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: 'application/octet-stream' },
    uploadedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

studentDocumentSchema.index({ schoolId: 1, studentId: 1 });

module.exports = mongoose.model('StudentDocument', studentDocumentSchema);
