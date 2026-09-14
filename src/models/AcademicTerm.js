const mongoose = require('mongoose');

const academicTermSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    sequence: { type: Number, default: 1 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

academicTermSchema.index({ schoolId: 1, academicYearId: 1, code: 1 }, { unique: true });
academicTermSchema.index({ schoolId: 1, academicYearId: 1, sequence: 1 });

module.exports = mongoose.model('AcademicTerm', academicTermSchema);

