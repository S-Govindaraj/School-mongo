const mongoose = require('mongoose');

const studentMarkSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    examSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSubject', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    // Denormalized from Enrollment at write time by the service layer (not a hook).
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade' },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    // undefined when isAbsent/isExempted — never default to 0.
    marksObtained: { type: Number, min: 0 },
    // Phase 2: theory/practical split — same "undefined, never 0" convention as
    // marksObtained above. Only populated when the ExamSubject has
    // hasTheoryPractical true; marksObtained still holds the derived total.
    theoryMarksObtained: { type: Number, min: 0 },
    practicalMarksObtained: { type: Number, min: 0 },
    isAbsent: { type: Boolean, default: false },
    isExempted: { type: Boolean, default: false },
    remarks: { type: String, default: '' },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    enteredAt: { type: Date },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastModifiedAt: { type: Date },
    // Manual optimistic-concurrency counter — NOT Mongoose's built-in __v.
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// This IS the upsert key for idempotent marks-grid saves.
studentMarkSchema.index({ schoolId: 1, examSubjectId: 1, studentId: 1 }, { unique: true });
studentMarkSchema.index({ schoolId: 1, examSubjectId: 1 });

module.exports = mongoose.model('StudentMark', studentMarkSchema);
