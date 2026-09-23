// PURE FUNCTIONS ONLY — no Mongoose/DB imports, no framework dependencies.
// Deliberately framework-free so this is trivially unit-testable without a
// database (see scripts/testResultCalculationService.js).

const GRADE_THRESHOLDS = [
  { min: 90, grade: 'A+' },
  { min: 80, grade: 'A' },
  { min: 70, grade: 'B+' },
  { min: 60, grade: 'B' },
  { min: 50, grade: 'C' },
  { min: 35, grade: 'D' },
  { min: 0, grade: 'F' },
];
// Phase 2: thresholds are now configurable via Setting({category:'examination',
// key:'grading.thresholds'}) — see services/gradingSchemeService.js, which is
// the DB-aware layer that resolves a thresholds array and passes it in here.
// This file itself must stay pure and never import Setting/Mongoose.

const computeGrade = (percentage, thresholds = GRADE_THRESHOLDS) => {
  for (const t of thresholds) {
    if (percentage >= t.min) return t.grade;
  }
  return 'F';
};

const computeResultRow = (studentMark, examSubject, thresholds = GRADE_THRESHOLDS) => {
  if (studentMark.isAbsent) {
    return { totalObtained: 0, percentage: 0, grade: 'AB', remarks: studentMark.remarks || 'Absent' };
  }
  if (studentMark.isExempted) {
    return { totalObtained: 0, percentage: 0, grade: 'EX', remarks: studentMark.remarks || 'Exempted' };
  }
  const percentage = Math.round(((studentMark.marksObtained / examSubject.maxMarks) * 100) * 10) / 10;
  return {
    totalObtained: studentMark.marksObtained,
    percentage,
    grade: computeGrade(percentage, thresholds),
    remarks: studentMark.remarks || '',
  };
};

module.exports = { computeGrade, computeResultRow, GRADE_THRESHOLDS };
