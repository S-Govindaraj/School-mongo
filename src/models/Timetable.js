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
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'INACTIVE' },
    // Generator/manual-edit provenance and workflow — see Smart Timetable Generator.
    source: { type: String, enum: ['MANUAL', 'AUTO_GENERATED', 'AUTO_GENERATED_THEN_EDITED', 'IMPORTED'], default: 'MANUAL' },
    isLocked: { type: Boolean, default: false },
    generatedAt: { type: Date },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
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

// Prevent room double booking for same day & period if free-text room specified
timetableSchema.index(
  { schoolId: 1, academicYearId: 1, roomNumber: 1, dayOfWeek: 1, periodId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE', roomNumber: { $gt: '' } } }
);

// Prevent room double booking for same day & period if a Room record is linked.
// Kept as a separate partial index (distinct filter) so legacy free-text rows and
// new roomId-linked rows can never collide with each other's constraint.
timetableSchema.index(
  { schoolId: 1, academicYearId: 1, roomId: 1, dayOfWeek: 1, periodId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE', roomId: { $exists: true, $ne: null } } }
);

module.exports = mongoose.model('Timetable', timetableSchema);
