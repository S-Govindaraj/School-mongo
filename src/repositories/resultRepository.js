const ExamResult = require('../models/ExamResult');

// ---------------------------------------------------------------------------
// ExamResult
// ---------------------------------------------------------------------------

const listExamResultsForExam = (schoolId, examId, filters = {}) => {
  const query = { schoolId, examId };
  if (filters.gradeId) query.gradeId = filters.gradeId;
  if (filters.sectionId) query.sectionId = filters.sectionId;
  // Phase 2 (Tranche 3b): analytics needs to scope a grade-distribution/stats
  // query down to a single subject, same optional-filter pattern as above.
  if (filters.subjectId) query.subjectId = filters.subjectId;
  return ExamResult.find(query)
    .populate('studentId', 'firstName lastName studentNumber admissionNumber')
    .populate('subjectId', 'name code')
    .lean();
};

// Phase 2 (Tranche 2a): term-weighted report-card aggregation.
// weightPercent lives on Exam, not ExamResult, so examId must be populated
// with it here — reportCardService needs it to weight each subject's exams.
const listExamResultsForStudentTerm = (schoolId, studentId, academicYearId, academicTermId) => {
  const query = { schoolId, studentId, academicYearId, status: 'PUBLISHED' };
  if (academicTermId) query.academicTermId = academicTermId;
  return ExamResult.find(query)
    .populate('subjectId', 'name code')
    .populate('examId', 'title weightPercent examType')
    .lean();
};

// Used for peer-ranking within generateReportCard. Deliberately ALSO populates
// examId's weightPercent (a deviation from the illustrative spec snippet,
// which only populated it on the single-student query) — peer overall
// percentages must be aggregated with the exact same weighting rules as the
// requesting student's own percentage, or the resulting rank would compare a
// weighted number against unweighted ones and be meaningless.
const listExamResultsForGradeSectionTerm = (schoolId, gradeId, sectionId, academicYearId, academicTermId) => {
  const query = { schoolId, gradeId, sectionId, academicYearId, status: 'PUBLISHED' };
  if (academicTermId) query.academicTermId = academicTermId;
  return ExamResult.find(query)
    .populate('examId', 'weightPercent')
    .lean();
};

module.exports = {
  listExamResultsForExam,
  listExamResultsForStudentTerm,
  listExamResultsForGradeSectionTerm,
};
