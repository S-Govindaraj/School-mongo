const mongoose = require('mongoose');

// Phase 2 (Tranche 2c): the sanctioned bypass for editing marks on a LOCKED
// exam. A correction always goes through this request/approve(or reject)
// workflow — StudentMark rows on a LOCKED exam are otherwise frozen by
// marksEntryService.saveMarksBatch's LOCKED guard.
const valueSnapshotSchema = new mongoose.Schema(
  {
    marksObtained: { type: Number },
    theoryMarksObtained: { type: Number },
    practicalMarksObtained: { type: Number },
    isAbsent: { type: Boolean },
    isExempted: { type: Boolean },
    remarks: { type: String },
  },
  { _id: false }
);

const resultCorrectionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    examSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSubject', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, default: Date.now },
    reason: { type: String, required: true },
    // Snapshotted from the existing StudentMark at request time — all fields
    // legitimately undefined/null when no prior StudentMark row exists at all
    // (e.g. correcting a student who was missed entirely during marks entry).
    previousValue: { type: valueSnapshotSchema, default: {} },
    requestedValue: { type: valueSnapshotSchema, default: {} },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'APPLIED'], default: 'PENDING' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNotes: { type: String },
    appliedAt: { type: Date },
  },
  { timestamps: true }
);

resultCorrectionSchema.index({ schoolId: 1, examId: 1, status: 1 });
resultCorrectionSchema.index({ schoolId: 1, studentId: 1 });

module.exports = mongoose.model('ResultCorrection', resultCorrectionSchema);
