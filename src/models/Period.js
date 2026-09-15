const mongoose = require('mongoose');

const periodSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    sequence: { type: Number, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    durationMinutes: { type: Number, default: 45 },
    isBreak: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

periodSchema.index({ schoolId: 1, code: 1 }, { unique: true });
periodSchema.index({ schoolId: 1, sequence: 1 });

module.exports = mongoose.model('Period', periodSchema);
