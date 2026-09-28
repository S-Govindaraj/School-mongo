const mongoose = require('mongoose');

const attendanceAuditSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    attendanceDayId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDay', required: true },
    // Sub-document _id of the specific periods[] entry this correction touched.
    periodEntryId: { type: mongoose.Schema.Types.ObjectId, required: true },
    previousStatusId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceStatus', required: true },
    newStatusId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceStatus', required: true },
    reason: { type: String, required: true, trim: true },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: Date.now },
    ipAddress: { type: String, default: '127.0.0.1' },
    requestId: { type: String, default: '' },
  },
  { timestamps: true }
);

attendanceAuditSchema.index({ schoolId: 1, attendanceDayId: 1, periodEntryId: 1, timestamp: -1 });

module.exports = mongoose.model('AttendanceAudit', attendanceAuditSchema, 'attendanceAudits');
