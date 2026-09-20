const mongoose = require('mongoose');

const teacherAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    isClassTeacher: { type: Boolean, default: false },
    assignmentType: { type: String, enum: ['PRIMARY', 'ASSISTANT', 'CO_TEACHER'], default: 'PRIMARY' },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'INACTIVE' },
  },
  { timestamps: true }
);

teacherAssignmentSchema.index(
  { schoolId: 1, academicYearId: 1, gradeId: 1, sectionId: 1, subjectId: 1, staffId: 1 },
  { unique: true }
);
// Fast lookup for timetable validation — teacher conflict check
teacherAssignmentSchema.index({ schoolId: 1, academicYearId: 1, staffId: 1, status: 1 });
// Section-level assignment listing
teacherAssignmentSchema.index({ schoolId: 1, academicYearId: 1, sectionId: 1, status: 1 });

module.exports = mongoose.model('TeacherAssignment', teacherAssignmentSchema);
