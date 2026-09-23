/**
 * Framework-free regression tests for rankingService — pure functions, no DB,
 * no Mongoose. Mirrors the pattern used by testResultCalculationService.js.
 *
 * Usage: node src/scripts/testRankingService.js
 */
const assert = require('assert');

const { rankStudents } = require('../services/rankingService');

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
  console.log('\n--- rankingService regression tests ---\n');

  test('a clear 1st/2nd/3rd (no ties) ranks in descending percentage order', () => {
    const result = rankStudents([
      { studentId: 'a', percentage: 60, totalObtained: 60 },
      { studentId: 'b', percentage: 90, totalObtained: 90 },
      { studentId: 'c', percentage: 75, totalObtained: 75 },
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.studentId, r]));
    assert.strictEqual(byId.b.rank, 1);
    assert.strictEqual(byId.c.rank, 2);
    assert.strictEqual(byId.a.rank, 3);
  });

  test('a tie at 2nd place: both get rank 2, the next distinct value gets rank 4', () => {
    const result = rankStudents([
      { studentId: 'a', percentage: 90, totalObtained: 90 },
      { studentId: 'b', percentage: 80, totalObtained: 80 },
      { studentId: 'c', percentage: 80, totalObtained: 80 },
      { studentId: 'd', percentage: 70, totalObtained: 70 },
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.studentId, r]));
    assert.strictEqual(byId.a.rank, 1);
    assert.strictEqual(byId.b.rank, 2);
    assert.strictEqual(byId.c.rank, 2);
    assert.strictEqual(byId.d.rank, 4);
  });

  test('a full tie: every student shares rank 1', () => {
    const result = rankStudents([
      { studentId: 'a', percentage: 50, totalObtained: 50 },
      { studentId: 'b', percentage: 50, totalObtained: 50 },
      { studentId: 'c', percentage: 50, totalObtained: 50 },
    ]);
    result.forEach((r) => assert.strictEqual(r.rank, 1));
  });

  test('a single-student input yields rank 1', () => {
    const result = rankStudents([{ studentId: 'a', percentage: 42, totalObtained: 42 }]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].rank, 1);
  });

  test('an empty input yields an empty array, not a crash', () => {
    const result = rankStudents([]);
    assert.deepStrictEqual(result, []);
  });

  test('a percentage tie is broken by totalObtained (higher total ranks first)', () => {
    const result = rankStudents([
      { studentId: 'a', percentage: 80, totalObtained: 400 },
      { studentId: 'b', percentage: 80, totalObtained: 480 },
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.studentId, r]));
    assert.strictEqual(byId.b.rank, 1);
    assert.strictEqual(byId.a.rank, 2);
  });

  test('rankStudents does not mutate the input array', () => {
    const input = [
      { studentId: 'a', percentage: 60, totalObtained: 60 },
      { studentId: 'b', percentage: 90, totalObtained: 90 },
    ];
    const inputCopy = input.map((s) => ({ ...s }));
    rankStudents(input);
    assert.deepStrictEqual(input, inputCopy);
  });

  test('extra pass-through fields on the input survive onto the ranked output', () => {
    const result = rankStudents([{ studentId: 'a', percentage: 88, totalObtained: 88, studentName: 'Ada' }]);
    assert.strictEqual(result[0].studentName, 'Ada');
  });

  console.log(`\n${passed} test(s) passed.\n`);
}

run();
