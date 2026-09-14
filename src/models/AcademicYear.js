const mongoose = require('mongoose');

const academicYearSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

academicYearSchema.index({ schoolId: 1, code: 1 }, { unique: true });
academicYearSchema.index({ schoolId: 1, isCurrent: 1 });

module.exports = mongoose.model('AcademicYear', academicYearSchema);

