const mongoose = require('mongoose');

const exportJobSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    reportCode: { type: String, required: true },
    module: { type: String, required: true },
    exportFormat: { type: String, enum: ['CSV', 'EXCEL', 'PDF'], default: 'CSV' },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    columns: [{ type: String }],
    status: { type: String, enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'], default: 'QUEUED' },
    fileKey: { type: String },
    fileName: { type: String },
    fileSize: { type: Number, default: 0 },
    downloadUrl: { type: String },
    errorDetails: { type: String },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

exportJobSchema.index({ schoolId: 1, requestedBy: 1, createdAt: -1 });

module.exports = mongoose.model('ExportJob', exportJobSchema);
