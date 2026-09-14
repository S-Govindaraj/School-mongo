const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    capacity: { type: Number, default: 40 },
    room: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

sectionSchema.index({ schoolId: 1, gradeId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Section', sectionSchema);

