const mongoose = require('mongoose');

const examResultSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
    academicTermId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm' },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    examTitle: { type: String, required: true, trim: true },
    examType: { type: String, enum: ['UNIT_TEST', 'MID_TERM', 'FINAL', 'PROJECT', 'PRACTICAL'], default: 'MID_TERM' },
    maxMarks: { type: Number, required: true, default: 100 },
    totalObtained: { type: Number, required: true },
    percentage: { type: Number, required: true },
    grade: { type: String, required: true, trim: true },
    remarks: { type: String, default: '' },
    status: { type: String, enum: ['PUBLISHED', 'DRAFT', 'ARCHIVED'], default: 'PUBLISHED' },
    publishedAt: { type: Date, default: Date.now },
    // Phase 1 Examinations module linkage — optional so existing demo/legacy
    // ExamResult rows (created before the Examinations module existed) remain valid.
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    examSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSubject' },
  },
  { timestamps: true }
);

examResultSchema.index({ schoolId: 1, studentId: 1, gradeId: 1 });
examResultSchema.index({ schoolId: 1, gradeId: 1, sectionId: 1, subjectId: 1 });
// Student 360: exams tab + performance trend chart query by student+year
examResultSchema.index({ schoolId: 1, studentId: 1, academicYearId: 1 });
// Partial unique index — the upsert key used by ResultService.publishResults.
// Partial so it never conflicts with existing rows that predate examSubjectId.
examResultSchema.index(
  { schoolId: 1, examSubjectId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { examSubjectId: { $exists: true } } }
);

module.exports = mongoose.model('ExamResult', examResultSchema);
