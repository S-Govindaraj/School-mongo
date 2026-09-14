const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    category: { type: String, default: 'Primary', trim: true },
    sequenceOrder: { type: Number, default: 1 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

gradeSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Grade', gradeSchema);

