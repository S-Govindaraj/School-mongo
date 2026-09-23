/**
 * Framework-free regression tests for resultCalculationService — pure
 * functions, no DB, no Mongoose. Mirrors the pattern used by
 * testStudent360Service.js.
 *
 * Usage: node src/scripts/testResultCalculationService.js
 */
const assert = require('assert');

const { computeGrade, computeResultRow, GRADE_THRESHOLDS } = require('../services/resultCalculationService');

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

function run() {
  console.log('\n--- resultCalculationService regression tests ---\n');

  // computeGrade boundary values — table is checked in descending threshold order,
  // so >= min wins for each band.
  test('computeGrade: 90 is the A+ boundary (inclusive)', () => {
    assert.strictEqual(computeGrade(90), 'A+');
    assert.strictEqual(computeGrade(89.9), 'A');
  });

  test('computeGrade: 80 is the A boundary (inclusive)', () => {
    assert.strictEqual(computeGrade(80), 'A');
    assert.strictEqual(computeGrade(79.9), 'B+');
  });

  test('computeGrade: 70 is the B+ boundary (inclusive)', () => {
    assert.strictEqual(computeGrade(70), 'B+');
    assert.strictEqual(computeGrade(69.9), 'B');
  });

  test('computeGrade: 60 is the B boundary (inclusive)', () => {
    assert.strictEqual(computeGrade(60), 'B');
    assert.strictEqual(computeGrade(59.9), 'C');
  });

  test('computeGrade: 50 is the C boundary (inclusive)', () => {
    assert.strictEqual(computeGrade(50), 'C');
    assert.strictEqual(computeGrade(49.9), 'D');
  });

  test('computeGrade: 35 is the D boundary (inclusive)', () => {
    assert.strictEqual(computeGrade(35), 'D');
    assert.strictEqual(computeGrade(34.9), 'F');
  });

  test('computeGrade: 0 and negative-adjacent values fall through to F', () => {
    assert.strictEqual(computeGrade(0), 'F');
    assert.strictEqual(computeGrade(10), 'F');
  });

  test('computeGrade: 100 (perfect score) is A+', () => {
    assert.strictEqual(computeGrade(100), 'A+');
  });

  test('GRADE_THRESHOLDS is exported and has 7 bands', () => {
    assert.strictEqual(GRADE_THRESHOLDS.length, 7);
  });

  // computeResultRow — absent path
  test('computeResultRow: isAbsent yields grade AB, totalObtained 0, percentage 0', () => {
    const row = computeResultRow({ isAbsent: true, remarks: '' }, { maxMarks: 100 });
    assert.strictEqual(row.grade, 'AB');
    assert.strictEqual(row.totalObtained, 0);
    assert.strictEqual(row.percentage, 0);
    assert.strictEqual(row.remarks, 'Absent');
  });

  test('computeResultRow: isAbsent preserves a custom remark instead of the default', () => {
    const row = computeResultRow({ isAbsent: true, remarks: 'Medical leave' }, { maxMarks: 100 });
    assert.strictEqual(row.remarks, 'Medical leave');
  });

  // computeResultRow — exempted path
  test('computeResultRow: isExempted yields grade EX, totalObtained 0, percentage 0', () => {
    const row = computeResultRow({ isExempted: true, remarks: '' }, { maxMarks: 100 });
    assert.strictEqual(row.grade, 'EX');
    assert.strictEqual(row.totalObtained, 0);
    assert.strictEqual(row.percentage, 0);
    assert.strictEqual(row.remarks, 'Exempted');
  });

  // computeResultRow — normal pass
  test('computeResultRow: a normal pass computes percentage and grade from marksObtained/maxMarks', () => {
    const row = computeResultRow({ marksObtained: 85, remarks: '' }, { maxMarks: 100 });
    assert.strictEqual(row.totalObtained, 85);
    assert.strictEqual(row.percentage, 85);
    assert.strictEqual(row.grade, 'A');
  });

  // computeResultRow — normal fail
  test('computeResultRow: a normal fail (below pass threshold) computes grade F', () => {
    const row = computeResultRow({ marksObtained: 20, remarks: '' }, { maxMarks: 100 });
    assert.strictEqual(row.totalObtained, 20);
    assert.strictEqual(row.percentage, 20);
    assert.strictEqual(row.grade, 'F');
  });

  test('computeResultRow: percentage is computed relative to a non-100 maxMarks and rounded to 1 decimal', () => {
    const row = computeResultRow({ marksObtained: 33, remarks: '' }, { maxMarks: 50 });
    assert.strictEqual(row.percentage, 66);
    assert.strictEqual(row.grade, 'B');
  });

  test('computeResultRow: rounds percentage to 1 decimal place', () => {
    const row = computeResultRow({ marksObtained: 1, remarks: '' }, { maxMarks: 3 });
    // 1/3 * 100 = 33.333... -> rounds to 33.3
    assert.strictEqual(row.percentage, 33.3);
  });

  console.log(`\n${passed} test(s) passed.\n`);
}

run();
