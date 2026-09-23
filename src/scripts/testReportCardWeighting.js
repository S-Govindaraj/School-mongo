/**
 * Framework-free regression tests for reportCardService.computeWeightedSubjectAverage
 * — pure-ish aggregation math, no DB. Mirrors the pattern used by
 * testResultCalculationService.js / testRankingService.js.
 *
 * Usage: node src/scripts/testReportCardWeighting.js
 */
const assert = require('assert');

const { computeWeightedSubjectAverage } = require('../services/reportCardService');

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

const resultWithWeight = (percentage, weightPercent) => ({ percentage, examId: { weightPercent } });
const resultWithoutWeight = (percentage) => ({ percentage, examId: { title: 'no weight configured' } });

function run() {
  console.log('\n--- reportCardService.computeWeightedSubjectAverage regression tests ---\n');

  test('all exams weighted: computes a true weight-average, not a plain mean', () => {
    // 40% weight @ 90%, 60% weight @ 60% -> (90*40 + 60*60) / 100 = 72
    const result = computeWeightedSubjectAverage([
      resultWithWeight(90, 40),
      resultWithWeight(60, 60),
    ]);
    assert.strictEqual(result.percentage, 72);
    assert.strictEqual(result.weighted, true);
    assert.strictEqual(result.examCount, 2);
  });

  test('mixed weighted/unweighted: the unweighted exam is EXCLUDED, not treated as weight=0', () => {
    // Only the weighted exam (80%) counts; the unweighted 20% exam is dropped
    // entirely from this calculation, per the documented judgment call.
    const result = computeWeightedSubjectAverage([
      resultWithWeight(80, 100),
      resultWithoutWeight(20),
    ]);
    assert.strictEqual(result.percentage, 80);
    assert.strictEqual(result.weighted, true);
    assert.strictEqual(result.examCount, 1);
  });

  test('zero weighted exams in the group: falls back to a simple equal average across the whole group', () => {
    const result = computeWeightedSubjectAverage([
      resultWithoutWeight(70),
      resultWithoutWeight(90),
    ]);
    assert.strictEqual(result.percentage, 80);
    assert.strictEqual(result.weighted, false);
    assert.strictEqual(result.examCount, 2);
  });

  test('a single unweighted exam: the average is just that exam\'s percentage', () => {
    const result = computeWeightedSubjectAverage([resultWithoutWeight(55)]);
    assert.strictEqual(result.percentage, 55);
    assert.strictEqual(result.weighted, false);
    assert.strictEqual(result.examCount, 1);
  });

  test('a single weighted exam: the weight cancels out, average is just that exam\'s percentage', () => {
    const result = computeWeightedSubjectAverage([resultWithWeight(65, 30)]);
    assert.strictEqual(result.percentage, 65);
    assert.strictEqual(result.weighted, true);
    assert.strictEqual(result.examCount, 1);
  });

  test('weights that do not sum to 100 (e.g. two exams at 30 and 20) still normalize correctly', () => {
    // (90*30 + 50*20) / 50 = 74
    const result = computeWeightedSubjectAverage([
      resultWithWeight(90, 30),
      resultWithWeight(50, 20),
    ]);
    assert.strictEqual(result.percentage, 74);
  });

  test('degenerate case: every weighted exam has weightPercent 0 falls back to an equal average of the weighted subset (no divide-by-zero crash)', () => {
    const result = computeWeightedSubjectAverage([
      resultWithWeight(60, 0),
      resultWithWeight(80, 0),
    ]);
    assert.strictEqual(result.percentage, 70);
    assert.strictEqual(result.weighted, true);
  });

  test('an empty group returns a zero percentage, not a crash', () => {
    const result = computeWeightedSubjectAverage([]);
    assert.strictEqual(result.percentage, 0);
    assert.strictEqual(result.examCount, 0);
  });

  console.log(`\n${passed} test(s) passed.\n`);
}

run();
