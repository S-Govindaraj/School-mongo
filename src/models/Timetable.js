const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus' },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    dayOfWeek: {
      type: String,
      enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      required: true,
    },
    periodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Period', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    roomNumber: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'INACTIVE' },
  },
  { timestamps: true }
);

// Prevent section double booking for same day & period
timetableSchema.index(
  { schoolId: 1, academicYearId: 1, sectionId: 1, dayOfWeek: 1, periodId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
);

// Prevent teacher double booking for same day & period
timetableSchema.index(
  { schoolId: 1, academicYearId: 1, teacherId: 1, dayOfWeek: 1, periodId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
);

// Prevent room double booking for same day & period if room specified
timetableSchema.index(
  { schoolId: 1, academicYearId: 1, roomNumber: 1, dayOfWeek: 1, periodId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE', roomNumber: { $gt: '' } } }
);

module.exports = mongoose.model('Timetable', timetableSchema);
