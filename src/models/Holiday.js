const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    holidayType: {
      type: String,
      enum: ['SCHOOL', 'GOVERNMENT', 'LOCAL', 'OPTIONAL', 'SPECIAL'],
      default: 'SCHOOL',
    },
    description: String,
    applicableTo: {
      type: String,
      enum: ['STUDENTS', 'STAFF', 'BOTH'],
      default: 'BOTH',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

holidaySchema.index({ schoolId: 1, date: 1 }, { unique: true });
holidaySchema.index({ schoolId: 1, academicYearId: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);
