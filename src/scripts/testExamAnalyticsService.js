/**
 * Framework-free regression tests for examAnalyticsService.buildAnalytics —
 * pure functions, no DB, no Mongoose. Mirrors the pattern used by
 * testRankingService.js / testReportCardWeighting.js.
 *
 * Usage: node src/scripts/testExamAnalyticsService.js
 */
const assert = require('assert');

const { buildAnalytics } = require('../services/examAnalyticsService');

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.message}`);
    process.exitCode = 1;
  }
};

const row = (grade, percentage, subjectId) => ({
  grade,
  percentage,
  totalObtained: percentage,
  maxMarks: 100,
  subjectId: subjectId || 'subj-default',
});

function run() {
  console.log('\n--- examAnalyticsService.buildAnalytics regression tests ---\n');

  test('an empty rows array returns a zeroed-out shape, not a crash', () => {
    const result = buildAnalytics([]);
    assert.deepStrictEqual(result.gradeDistribution, []);
    assert.deepStrictEqual(result.passFailCount, { pass: 0, fail: 0, absent: 0, exempted: 0 });
    assert.strictEqual(result.averagePercentage, 0);
    assert.strictEqual(result.highestPercentage, 0);
    assert.strictEqual(result.lowestPercentage, 0);
    assert.deepStrictEqual(result.subjectAverages, []);
    assert.strictEqual(result.totalStudents, 0);
  });

  test('buildAnalytics also tolerates a null/undefined rows argument', () => {
    assert.strictEqual(buildAnalytics(null).totalStudents, 0);
    assert.strictEqual(buildAnalytics(undefined).totalStudents, 0);
  });

  test('all-same-grade input: one gradeDistribution bucket, correct pass count', () => {
    const result = buildAnalytics([row('A', 85), row('A', 92), row('A', 88)]);
    assert.deepStrictEqual(result.gradeDistribution, [{ grade: 'A', count: 3 }]);
    assert.strictEqual(result.passFailCount.pass, 3);
    assert.strictEqual(result.passFailCount.fail, 0);
    assert.strictEqual(result.passFailCount.absent, 0);
    assert.strictEqual(result.passFailCount.exempted, 0);
    assert.strictEqual(result.totalStudents, 3);
  });

  test("AB/EX rows are counted in gradeDistribution and the absent/exempted buckets, but excluded from average/highest/lowest", () => {
    const rows = [
      row('A', 90),
      row('B', 70),
      row('AB', 0),
      row('EX', 0),
      row('F', 20),
    ];
    const result = buildAnalytics(rows);

    // All 5 rows counted in distribution.
    const byGrade = Object.fromEntries(result.gradeDistribution.map((g) => [g.grade, g.count]));
    assert.strictEqual(byGrade.A, 1);
    assert.strictEqual(byGrade.B, 1);
    assert.strictEqual(byGrade.AB, 1);
    assert.strictEqual(byGrade.EX, 1);
    assert.strictEqual(byGrade.F, 1);
    assert.strictEqual(result.totalStudents, 5);

    // 4-bucket pass/fail/absent/exempted classification.
    assert.strictEqual(result.passFailCount.pass, 2); // A, B
    assert.strictEqual(result.passFailCount.fail, 1); // F
    assert.strictEqual(result.passFailCount.absent, 1); // AB
    assert.strictEqual(result.passFailCount.exempted, 1); // EX

    // Only A(90), B(70), F(20) count toward average/highest/lowest — AB/EX excluded.
    assert.strictEqual(result.averagePercentage, 60); // (90+70+20)/3 = 60
    assert.strictEqual(result.highestPercentage, 90);
    assert.strictEqual(result.lowestPercentage, 20);
  });

  test('subjectId populated as {_id,name} is grouped/named correctly', () => {
    const rows = [
      row('A', 90, { _id: 'math-1', name: 'Mathematics' }),
      row('B', 70, { _id: 'math-1', name: 'Mathematics' }),
    ];
    const result = buildAnalytics(rows);
    assert.strictEqual(result.subjectAverages.length, 1);
    assert.strictEqual(result.subjectAverages[0].subjectId, 'math-1');
    assert.strictEqual(result.subjectAverages[0].subjectName, 'Mathematics');
    assert.strictEqual(result.subjectAverages[0].average, 80);
  });

  test('subjectId as a raw ObjectId-like string is grouped correctly, with a fallback name', () => {
    const rows = [
      row('A', 100, 'sci-raw-id'),
      row('C', 50, 'sci-raw-id'),
    ];
    const result = buildAnalytics(rows);
    assert.strictEqual(result.subjectAverages.length, 1);
    assert.strictEqual(result.subjectAverages[0].subjectId, 'sci-raw-id');
    assert.strictEqual(result.subjectAverages[0].subjectName, 'Unknown');
    assert.strictEqual(result.subjectAverages[0].average, 75);
  });

  test('mixed populated and raw subjectId rows in the same fixture are both handled independently', () => {
    const rows = [
      row('A', 90, { _id: 'math-1', name: 'Mathematics' }),
      row('B', 60, 'sci-raw-id'),
      row('A', 100, { _id: 'math-1', name: 'Mathematics' }),
    ];
    const result = buildAnalytics(rows);
    const byId = Object.fromEntries(result.subjectAverages.map((s) => [s.subjectId, s]));
    assert.strictEqual(byId['math-1'].subjectName, 'Mathematics');
    assert.strictEqual(byId['math-1'].average, 95); // (90+100)/2
    assert.strictEqual(byId['sci-raw-id'].subjectName, 'Unknown');
    assert.strictEqual(byId['sci-raw-id'].average, 60);
  });

  test('a realistic mixed fixture: hand-computed averagePercentage and gradeDistribution', () => {
    // 6 rows across 2 subjects: Math (A 90, B 75, F 30) and Science (A 88, AB 0, EX 0)
    const rows = [
      row('A', 90, { _id: 'math-1', name: 'Mathematics' }),
      row('B', 75, { _id: 'math-1', name: 'Mathematics' }),
      row('F', 30, { _id: 'math-1', name: 'Mathematics' }),
      row('A', 88, { _id: 'sci-1', name: 'Science' }),
      row('AB', 0, { _id: 'sci-1', name: 'Science' }),
      row('EX', 0, { _id: 'sci-1', name: 'Science' }),
    ];
    const result = buildAnalytics(rows);

    assert.strictEqual(result.totalStudents, 6);

    const byGrade = Object.fromEntries(result.gradeDistribution.map((g) => [g.grade, g.count]));
    assert.deepStrictEqual(byGrade, { A: 2, B: 1, F: 1, AB: 1, EX: 1 });

    assert.deepStrictEqual(result.passFailCount, { pass: 3, fail: 1, absent: 1, exempted: 1 });

    // Real-score rows only: 90, 75, 30, 88 -> sum 283 / 4 = 70.75 -> rounds to 70.8
    assert.strictEqual(result.averagePercentage, 70.8);
    assert.strictEqual(result.highestPercentage, 90);
    assert.strictEqual(result.lowestPercentage, 30);

    const byId = Object.fromEntries(result.subjectAverages.map((s) => [s.subjectId, s]));
    assert.strictEqual(byId['math-1'].average, 65); // (90+75+30)/3 = 65
    assert.strictEqual(byId['sci-1'].average, 88); // only the A row is a real score
  });

  console.log(`\n${passed} test(s) passed.\n`);
}

run();
