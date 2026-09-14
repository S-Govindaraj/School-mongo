const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    shortName: { type: String, default: '', trim: true },
    type: { type: String, enum: ['CORE', 'ELECTIVE', 'LAB', 'ACTIVITY', 'LANGUAGE'], default: 'CORE' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Subject', subjectSchema);

