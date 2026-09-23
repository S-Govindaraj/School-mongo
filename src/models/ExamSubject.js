const mongoose = require('mongoose');

// One row per exam+grade+subject — deliberately combines subject-level marks
// configuration (maxMarks/passMarks) AND scheduling (examDate/time/room/
// invigilator) into a single model instead of splitting them into two.
const examSubjectSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true }, // denormalized from Exam
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    maxMarks: { type: Number, required: true, default: 100 },
    passMarks: { type: Number, required: true, default: 35 },
    // Phase 2: optional theory/practical split. When hasTheoryPractical is true,
    // maxMarks/passMarks above remain the authoritative totals — the SERVICE
    // layer (examService.setExamSubjects) derives them from these two pairs
    // before saving; never trust a client-supplied total for a split subject.
    hasTheoryPractical: { type: Boolean, default: false },
    theoryMaxMarks: { type: Number, min: 0 },
    theoryPassMarks: { type: Number, min: 0 },
    practicalMaxMarks: { type: Number, min: 0 },
    practicalPassMarks: { type: Number, min: 0 },
    examDate: { type: Date },
    startTime: { type: String, trim: true }, // 'HH:mm' free text, same convention as Period model
    endTime: { type: String, trim: true },
    durationMinutes: { type: Number },
    room: { type: String, default: '' },
    invigilatorStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    marksVerifiedAt: { type: Date }, // unset = not verified
    marksVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

examSubjectSchema.index({ schoolId: 1, examId: 1, gradeId: 1, subjectId: 1 }, { unique: true });
examSubjectSchema.index({ schoolId: 1, invigilatorStaffId: 1, examDate: 1 });
examSubjectSchema.index({ schoolId: 1, examId: 1, examDate: 1 });

module.exports = mongoose.model('ExamSubject', examSubjectSchema);
