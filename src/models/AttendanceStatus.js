const mongoose = require('mongoose');

const attendanceStatusSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true }, // e.g. "Present", "Absent", "Late", "Excused"
    code: { type: String, required: true, trim: true }, // e.g. "PRESENT", "ABSENT", "LATE"
    shortCode: { type: String, required: true, trim: true }, // e.g. "P", "A", "L", "E"
    countsAsPresent: { type: Boolean, default: true },
    countsAsAbsent: { type: Boolean, default: false },
    requiresReason: { type: Boolean, default: false },
    colorToken: { type: String, default: 'emerald' }, // UI badge color token
    sequence: { type: Number, default: 1 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

attendanceStatusSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceStatus', attendanceStatusSchema);
