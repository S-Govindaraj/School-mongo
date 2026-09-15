const mongoose = require('mongoose');

const attendanceAuditSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    attendanceRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRecord', required: true },
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

attendanceAuditSchema.index({ schoolId: 1, attendanceRecordId: 1, timestamp: -1 });

module.exports = mongoose.model('AttendanceAudit', attendanceAuditSchema);
