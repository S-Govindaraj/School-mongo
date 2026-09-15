const mongoose = require('mongoose');

const reportScheduleSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportDefinition', required: true },
    reportCode: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    frequency: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY'], required: true },
    recipients: [{ type: String, trim: true }], // Email addresses
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    exportFormat: { type: String, enum: ['CSV', 'EXCEL', 'PDF'], default: 'CSV' },
    nextRunAt: { type: Date, required: true },
    lastRunAt: { type: Date },
    status: { type: String, enum: ['ACTIVE', 'PAUSED', 'EXPIRED'], default: 'ACTIVE' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

reportScheduleSchema.index({ schoolId: 1, nextRunAt: 1, status: 1 });

module.exports = mongoose.model('ReportSchedule', reportScheduleSchema);
