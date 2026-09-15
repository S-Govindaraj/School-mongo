const mongoose = require('mongoose');

const documentVersionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    version: { type: Number, required: true },
    fileName: { type: String, required: true },
    storageKey: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    checksum: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

documentVersionSchema.index({ schoolId: 1, documentId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('DocumentVersion', documentVersionSchema);
