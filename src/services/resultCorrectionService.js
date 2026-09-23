const examRepository = require('../repositories/examRepository');
const ResultCorrection = require('../models/ResultCorrection');
const ExamResult = require('../models/ExamResult');
const Enrollment = require('../models/Enrollment');
const gradingSchemeService = require('./gradingSchemeService');
const { computeResultRow } = require('./resultCalculationService');
const { NotFoundError, ValidationError } = require('../utils/errors');

// Mirrors marksEntryService.saveMarksBatch's per-row validation rules
// exactly, scoped to a single row instead of a batch, and throwing instead of
// accumulating an errors array — so a correction request is held to the same
// standard the backend would otherwise accept for that ExamSubject.
const validateRequestedValue = (examSubject, row) => {
  const isSplit = !!examSubject.hasTheoryPractical;
  const hasTheoryOrPractical = (row.theoryMarksObtained !== undefined && row.theoryMarksObtained !== null)
    || (row.practicalMarksObtained !== undefined && row.practicalMarksObtained !== null);
  const hasFlatMarks = row.marksObtained !== undefined && row.marksObtained !== null;
  const isPresentRow = !(row.isAbsent === true) && !(row.isExempted === true);

  if (!isSplit && hasTheoryOrPractical) {
    throw new ValidationError('theoryMarksObtained/practicalMarksObtained are not accepted for a subject without a theory/practical split.');
  }

  if (isSplit && isPresentRow) {
    const flagCount = [hasTheoryOrPractical, row.isAbsent === true, row.isExempted === true].filter(Boolean).length;
    if (hasFlatMarks) {
      throw new ValidationError('marksObtained must not be sent directly for a theory/practical split subject; send theoryMarksObtained and practicalMarksObtained instead.');
    }
    if (flagCount !== 1 || row.theoryMarksObtained === undefined || row.theoryMarksObtained === null
      || row.practicalMarksObtained === undefined || row.practicalMarksObtained === null) {
      throw new ValidationError('Both theoryMarksObtained and practicalMarksObtained must be set (or exactly one of isAbsent/isExempted).');
    }
    if (row.theoryMarksObtained < 0 || row.theoryMarksObtained > examSubject.theoryMaxMarks) {
      throw new ValidationError(`theoryMarksObtained must be between 0 and ${examSubject.theoryMaxMarks}.`);
    }
    if (row.practicalMarksObtained < 0 || row.practicalMarksObtained > examSubject.practicalMaxMarks) {
      throw new ValidationError(`practicalMarksObtained must be between 0 and ${examSubject.practicalMaxMarks}.`);
    }
    return;
  }

  const flagCount = [hasFlatMarks, row.isAbsent === true, row.isExempted === true].filter(Boolean).length;
  if (flagCount !== 1) {
    throw new ValidationError('Exactly one of marksObtained/isAbsent/isExempted must be set.');
  }
  if (hasFlatMarks && (row.marksObtained < 0 || row.marksObtained > examSubject.maxMarks)) {
    throw new ValidationError(`marksObtained must be between 0 and ${examSubject.maxMarks}.`);
  }
};

const requestCorrection = async (schoolId, userId, { examId, examSubjectId, studentId, requestedValue, reason }) => {
  const exam = await examRepository.findExamById(schoolId, examId);
  if (!exam) {
    throw new NotFoundError('Exam not found');
  }
  // Precise, confirmed scope: corrections are only requestable for a LOCKED
  // exam — that's exactly when the normal marks-entry grid is blocked.
  if (exam.status !== 'LOCKED') {
    throw new ValidationError('Corrections can only be requested for a LOCKED exam.');
  }

  const examSubject = await examRepository.findExamSubjectById(schoolId, examSubjectId);
  if (!examSubject) {
    throw new NotFoundError('Exam subject not found');
  }

  validateRequestedValue(examSubject, requestedValue || {});

  const existingMark = await examRepository.findStudentMark(schoolId, examSubjectId, studentId);
  const previousValue = existingMark
    ? {
      marksObtained: existingMark.marksObtained,
      theoryMarksObtained: existingMark.theoryMarksObtained,
      practicalMarksObtained: existingMark.practicalMarksObtained,
      isAbsent: existingMark.isAbsent,
      isExempted: existingMark.isExempted,
      remarks: existingMark.remarks,
    }
    // Legitimate case: no prior StudentMark row exists at all (e.g. a
    // student who was missed entirely during the original marks entry).
    : {};

  return ResultCorrection.create({
    schoolId,
    examId,
    examSubjectId,
    studentId,
    requestedBy: userId,
    reason,
    previousValue,
    requestedValue,
    status: 'PENDING',
  });
};

const listCorrections = (schoolId, { examId, status } = {}) => {
  const query = { schoolId };
  if (examId) query.examId = examId;
  if (status) query.status = status;
  return ResultCorrection.find(query)
    .populate('studentId', 'firstName lastName admissionNumber')
    .populate('examSubjectId')
    .populate('requestedBy', 'name email')
    .populate('reviewedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();
};

// Applies requestedValue to the underlying StudentMark (via the deliberate
// LOCKED-bypass repository call), recomputes the ExamResult row, and upserts
// it using the EXACT SAME {schoolId, examSubjectId, studentId} key/shape that
// resultService.publishResults uses — this is the most correctness-critical
// detail in this workflow: getting the key wrong would create a duplicate
// ExamResult row instead of correcting the published one.
const approveCorrection = async (schoolId, correctionId, userId) => {
  const correction = await ResultCorrection.findOne({ schoolId, _id: correctionId });
  if (!correction) {
    throw new NotFoundError('Correction request not found');
  }
  if (correction.status !== 'PENDING') {
    throw new ValidationError('Only a PENDING correction can be approved.');
  }

  const examSubject = await examRepository.findExamSubjectById(schoolId, correction.examSubjectId);
  if (!examSubject) {
    throw new NotFoundError('Exam subject not found');
  }
  const exam = await examRepository.findExamById(schoolId, correction.examId);
  if (!exam) {
    throw new NotFoundError('Exam not found');
  }

  // Same "resolve CURRENT enrollment, never trust a possibly-stale
  // denormalized value" pattern resultService.publishResults uses.
  const enrollment = await Enrollment.findOne({ schoolId, studentId: correction.studentId, isCurrent: true }).lean();
  if (!enrollment) {
    throw new ValidationError('No current enrollment found for this student; cannot apply correction.');
  }

  const rv = correction.requestedValue || {};
  const isPresentRow = !(rv.isAbsent === true) && !(rv.isExempted === true);
  const isSplit = !!examSubject.hasTheoryPractical;
  const rowIsSplit = isSplit && isPresentRow;

  const subjectId = examSubject.subjectId?._id || examSubject.subjectId;

  const newValues = {
    schoolId,
    examSubjectId: correction.examSubjectId,
    examId: correction.examId,
    studentId: correction.studentId,
    gradeId: enrollment.gradeId,
    sectionId: enrollment.sectionId,
    subjectId,
    isAbsent: !!rv.isAbsent,
    isExempted: !!rv.isExempted,
    remarks: rv.remarks || '',
    lastModifiedBy: userId,
  };
  if (isPresentRow) {
    newValues.marksObtained = rowIsSplit ? (rv.theoryMarksObtained + rv.practicalMarksObtained) : rv.marksObtained;
    if (rowIsSplit) {
      newValues.theoryMarksObtained = rv.theoryMarksObtained;
      newValues.practicalMarksObtained = rv.practicalMarksObtained;
    }
  }

  const appliedMark = await examRepository.applyCorrectionToStudentMark(schoolId, correction.examSubjectId, correction.studentId, newValues);

  const thresholds = await gradingSchemeService.getThresholds(schoolId);
  const computed = computeResultRow(appliedMark, examSubject, thresholds);

  // exam came from findExamById(), which populates academicYearId/academicTermId
  // (.lean() doc) — resolve back to raw ObjectIds, same as resultService.publishResults.
  const academicYearId = exam.academicYearId?._id || exam.academicYearId;
  const academicTermId = exam.academicTermId?._id || exam.academicTermId || undefined;

  // Exact mirror of resultService.publishResults's ExamResult upsert: same
  // {schoolId, examSubjectId, studentId} filter (the partial-unique index's
  // key) and the same $set shape.
  await ExamResult.findOneAndUpdate(
    { schoolId, examSubjectId: correction.examSubjectId, studentId: correction.studentId },
    {
      $set: {
        schoolId,
        studentId: correction.studentId,
        academicYearId,
        academicTermId,
        gradeId: enrollment.gradeId,
        sectionId: enrollment.sectionId,
        subjectId,
        examTitle: exam.title,
        examType: exam.examType,
        maxMarks: examSubject.maxMarks,
        ...computed,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        examId: correction.examId,
        examSubjectId: correction.examSubjectId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  correction.status = 'APPLIED';
  correction.appliedAt = new Date();
  correction.reviewedBy = userId;
  correction.reviewedAt = new Date();
  await correction.save();

  return correction;
};

const rejectCorrection = async (schoolId, correctionId, userId, reviewNotes) => {
  const correction = await ResultCorrection.findOne({ schoolId, _id: correctionId });
  if (!correction) {
    throw new NotFoundError('Correction request not found');
  }
  if (correction.status !== 'PENDING') {
    throw new ValidationError('Only a PENDING correction can be rejected.');
  }

  correction.status = 'REJECTED';
  correction.reviewedBy = userId;
  correction.reviewedAt = new Date();
  correction.reviewNotes = reviewNotes || '';
  await correction.save();

  return correction;
};

module.exports = {
  requestCorrection,
  listCorrections,
  approveCorrection,
  rejectCorrection,
};
