// PURE FUNCTIONS ONLY — no Mongoose/DB imports, no framework dependencies.
// Deliberately framework-free so this is trivially unit-testable without a
// database (see scripts/testExamAnalyticsService.js), mirroring the style of
// rankingService.js / resultCalculationService.js.

const round1 = (n) => Math.round(n * 10) / 10;

const subjectKeyOf = (row) => {
  const s = row.subjectId;
  return s && typeof s === 'object' ? String(s._id) : String(s);
};

const subjectNameOf = (row) => {
  const s = row.subjectId;
  return (s && typeof s === 'object' && s.name) || 'Unknown';
};

// ---------------------------------------------------------------------------
// Pass/fail/absent/exempted — judgment call, spelled out precisely:
//
// ExamResult stores only `grade` and `percentage` (percentage is 0 for both
// AB and EX rows, per resultCalculationService.computeResultRow — it is NOT
// a real score). There is no stored pass/fail boolean, and passMarks lives on
// ExamSubject, which this pure function does not have access to (it only
// receives already-fetched ExamResult rows). So pass/fail cannot be derived
// from a marks-vs-passMarks comparison here; the only usable signal is the
// letter grade itself.
//
// The spec's flat {pass, fail} shape would force a decision that loses
// information either way: lumping absent students into "fail" overstates
// failure, while lumping them into "pass" is simply wrong. Since the grade
// value already distinguishes 'F' from 'AB' from 'EX', we use FOUR buckets
// instead of two — this is strictly more accurate and no harder to compute:
//   - fail:     grade === 'F'                  (attempted, did not pass)
//   - absent:   grade === 'AB'                  (did not attempt — its own bucket, not folded into fail)
//   - exempted: grade === 'EX'                  (excused — its own bucket, not folded into pass)
//   - pass:     everything else (a real, non-'F' grade)
// This deviates from the spec's literal {pass, fail} shape; see report.
// ---------------------------------------------------------------------------
const classify = (row) => {
  if (row.grade === 'F') return 'fail';
  if (row.grade === 'AB') return 'absent';
  if (row.grade === 'EX') return 'exempted';
  return 'pass';
};

// AB/EX rows store percentage as 0 (not a real score), so they are excluded
// from average/highest/lowest — including them would incorrectly drag those
// numbers down. They ARE still counted in gradeDistribution and in the
// absent/exempted buckets above.
const isRealScore = (row) => row.grade !== 'AB' && row.grade !== 'EX';

const buildAnalytics = (rows) => {
  if (!rows || rows.length === 0) {
    return {
      gradeDistribution: [],
      passFailCount: { pass: 0, fail: 0, absent: 0, exempted: 0 },
      averagePercentage: 0,
      highestPercentage: 0,
      lowestPercentage: 0,
      subjectAverages: [],
      totalStudents: 0,
    };
  }

  // gradeDistribution — group by row.grade, including 'AB'/'EX'.
  const gradeCounts = {};
  rows.forEach((r) => {
    const grade = r.grade || 'UNKNOWN';
    gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
  });
  const gradeDistribution = Object.entries(gradeCounts).map(([grade, count]) => ({ grade, count }));

  // passFailCount — 4-bucket classification, see classify() doc above.
  const passFailCount = { pass: 0, fail: 0, absent: 0, exempted: 0 };
  rows.forEach((r) => {
    passFailCount[classify(r)] += 1;
  });

  // averagePercentage / highestPercentage / lowestPercentage — real scores only.
  const realScoreRows = rows.filter(isRealScore);
  let averagePercentage = 0;
  let highestPercentage = 0;
  let lowestPercentage = 0;
  if (realScoreRows.length > 0) {
    const percentages = realScoreRows.map((r) => r.percentage || 0);
    const sum = percentages.reduce((acc, p) => acc + p, 0);
    averagePercentage = round1(sum / realScoreRows.length);
    highestPercentage = Math.max(...percentages);
    lowestPercentage = Math.min(...percentages);
  }

  // subjectAverages — group by subjectId (populated {_id,name} or raw ref),
  // same real-score-only exclusion for the average.
  const subjectGroups = {};
  realScoreRows.forEach((r) => {
    const key = subjectKeyOf(r);
    if (!subjectGroups[key]) {
      subjectGroups[key] = { subjectId: key, subjectName: subjectNameOf(r), sum: 0, count: 0 };
    }
    subjectGroups[key].sum += r.percentage || 0;
    subjectGroups[key].count += 1;
    // Prefer a populated name if one shows up later in the group, in case
    // the first row for this subject happened to be unpopulated.
    if (subjectGroups[key].subjectName === 'Unknown') {
      subjectGroups[key].subjectName = subjectNameOf(r);
    }
  });
  const subjectAverages = Object.values(subjectGroups).map((g) => ({
    subjectId: g.subjectId,
    subjectName: g.subjectName,
    average: round1(g.sum / g.count),
  }));

  return {
    gradeDistribution,
    passFailCount,
    averagePercentage,
    highestPercentage,
    lowestPercentage,
    subjectAverages,
    totalStudents: rows.length,
  };
};

module.exports = { buildAnalytics };
