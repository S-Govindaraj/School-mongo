const resultRepository = require('../repositories/resultRepository');
const { rankStudents } = require('./rankingService');
const gradingSchemeService = require('./gradingSchemeService');
const { computeGrade } = require('./resultCalculationService');
const Enrollment = require('../models/Enrollment');

const round1 = (n) => Math.round(n * 10) / 10;

const subjectKeyOf = (result) => {
  const s = result.subjectId;
  return s && typeof s === 'object' ? String(s._id) : String(s);
};

const weightOf = (result) => {
  const e = result.examId;
  const w = e && typeof e === 'object' ? e.weightPercent : undefined;
  return typeof w === 'number' ? w : undefined;
};

const groupBySubject = (results) => {
  const groups = {};
  results.forEach((r) => {
    const key = subjectKeyOf(r);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return groups;
};

// ---------------------------------------------------------------------------
// computeWeightedSubjectAverage — the trickiest pure-ish piece of this
// tranche. Exported separately so it's testable without a DB
// (see scripts/testReportCardWeighting.js).
//
// Judgment call, spelled out precisely:
//   - If ANY exam result in this subject's group carries a numeric
//     exam.weightPercent, we compute a weight-averaged percentage across ONLY
//     the results that HAVE a weight. Any result in the SAME group whose exam
//     has no weight configured is EXCLUDED from that weighted calculation —
//     it is NOT silently treated as weight=0 (that would drag the average
//     down for an exam nobody asked to be de-emphasized).
//   - UNLESS none of the group's results have a weight at all, in which case
//     we fall back to a simple equal-average across the WHOLE group (the
//     "no weighting configured" case — Tranche 1 behavior, preserved).
//   - Degenerate case: if every weighted exam in the group has weightPercent
//     0 (so totalWeight is 0, which would otherwise divide by zero), we fall
//     back to a simple equal-average across just the weighted subset.
// ---------------------------------------------------------------------------
const computeWeightedSubjectAverage = (subjectResults) => {
  if (!subjectResults || subjectResults.length === 0) {
    return { percentage: 0, weighted: false, examCount: 0 };
  }

  const weighted = subjectResults.filter((r) => weightOf(r) !== undefined);

  if (weighted.length === 0) {
    const sum = subjectResults.reduce((acc, r) => acc + (r.percentage || 0), 0);
    return { percentage: round1(sum / subjectResults.length), weighted: false, examCount: subjectResults.length };
  }

  const totalWeight = weighted.reduce((acc, r) => acc + weightOf(r), 0);
  if (totalWeight <= 0) {
    const sum = weighted.reduce((acc, r) => acc + (r.percentage || 0), 0);
    return { percentage: round1(sum / weighted.length), weighted: true, examCount: weighted.length };
  }

  const weightedSum = weighted.reduce((acc, r) => acc + (r.percentage || 0) * weightOf(r), 0);
  return { percentage: round1(weightedSum / totalWeight), weighted: true, examCount: weighted.length };
};

// Aggregates one student's ExamResult rows (already grouped by subject) into
// the report-card `subjects` array, using computeWeightedSubjectAverage.
const aggregateSubjects = (results, thresholds) => {
  const groups = groupBySubject(results);
  return Object.entries(groups).map(([subjectId, group]) => {
    const { percentage, weighted, examCount } = computeWeightedSubjectAverage(group);
    const subjectDoc = group.find((r) => r.subjectId && typeof r.subjectId === 'object')?.subjectId;
    return {
      subjectId,
      subjectName: subjectDoc?.name || '',
      percentage,
      grade: computeGrade(percentage, thresholds),
      examCount,
      weighted,
    };
  });
};

// A peer's overall percentage, computed with the exact same subject-grouping
// and weighting rules as the requesting student — required for the rank to
// be a meaningful comparison (see resultRepository.listExamResultsForGradeSectionTerm).
const overallPercentageOf = (results) => {
  const groups = groupBySubject(results);
  const perSubjectPercentages = Object.values(groups).map((g) => computeWeightedSubjectAverage(g).percentage);
  if (perSubjectPercentages.length === 0) return 0;
  return round1(perSubjectPercentages.reduce((a, b) => a + b, 0) / perSubjectPercentages.length);
};

// Resolves the student's rank within their current grade+section for this
// academic year/term, by aggregating every peer's PUBLISHED ExamResults the
// same way this student's were aggregated, then ranking via rankingService.
const resolveRank = async (schoolId, studentId, academicYearId, academicTermId) => {
  const enrollment = await Enrollment.findOne({ schoolId, studentId, isCurrent: true }).lean();
  if (!enrollment) {
    return { rank: null, totalStudentsInSection: null };
  }

  const peerResults = await resultRepository.listExamResultsForGradeSectionTerm(
    schoolId, enrollment.gradeId, enrollment.sectionId, academicYearId, academicTermId
  );

  const byStudent = {};
  peerResults.forEach((r) => {
    const sid = String(r.studentId);
    if (!byStudent[sid]) byStudent[sid] = [];
    byStudent[sid].push(r);
  });

  const peerTotals = Object.entries(byStudent).map(([sid, results]) => {
    const percentage = overallPercentageOf(results);
    return { studentId: sid, percentage, totalObtained: percentage };
  });

  if (peerTotals.length === 0) {
    return { rank: null, totalStudentsInSection: null };
  }

  const ranked = rankStudents(peerTotals);
  const mine = ranked.find((r) => r.studentId === String(studentId));

  return { rank: mine ? mine.rank : null, totalStudentsInSection: ranked.length };
};

const generateReportCard = async (schoolId, studentId, academicYearId, academicTermId) => {
  const results = await resultRepository.listExamResultsForStudentTerm(schoolId, studentId, academicYearId, academicTermId);
  const thresholds = await gradingSchemeService.getThresholds(schoolId);

  const subjects = aggregateSubjects(results, thresholds);

  const overallPercentage = subjects.length > 0
    ? round1(subjects.reduce((acc, s) => acc + s.percentage, 0) / subjects.length)
    : 0;
  const overallGrade = computeGrade(overallPercentage, thresholds);

  const { rank, totalStudentsInSection } = await resolveRank(schoolId, studentId, academicYearId, academicTermId);

  return {
    studentId,
    academicYearId,
    academicTermId: academicTermId || null,
    subjects,
    overallPercentage,
    overallGrade,
    rank,
    totalStudentsInSection,
  };
};

module.exports = { generateReportCard, computeWeightedSubjectAverage };
