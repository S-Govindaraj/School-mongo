const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    ownerType: { type: String, enum: ['STUDENT', 'STAFF', 'SCHOOL', 'GUARDIAN'], required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    documentType: {
      type: String,
      enum: [
        'STUDENT_PHOTO', 'BIRTH_CERTIFICATE', 'TRANSFER_CERTIFICATE', 'ID_PROOF',
        'ADDRESS_PROOF', 'MEDICAL_DOCUMENT', 'STAFF_DOCUMENT', 'CERTIFICATE',
        'REPORT_CARD', 'INVOICE', 'RECEIPT', 'OTHER'
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    originalFileName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, default: 'application/octet-stream' },
    extension: { type: String, trim: true },
    size: { type: Number, required: true, default: 0 },
    storageKey: { type: String, required: true },
    storageProvider: { type: String, enum: ['LOCAL', 'S3'], default: 'LOCAL' },
    checksum: { type: String, trim: true },
    version: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['UPLOADED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'EXPIRED', 'ARCHIVED'],
      default: 'UPLOADED',
    },
    visibility: { type: String, enum: ['PRIVATE', 'PUBLIC', 'RESTRICTED'], default: 'PRIVATE' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    expiresAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    metadata: { type: Map, of: String },
  },
  { timestamps: true }
);

documentSchema.index({ schoolId: 1, ownerType: 1, ownerId: 1 });
documentSchema.index({ schoolId: 1, expiresAt: 1 });
documentSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Document', documentSchema);
