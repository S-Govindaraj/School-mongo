/**
 * Framework-free regression tests for MarksEntryService, run against
 * in-memory fixtures with the repository layer stubbed out — no live
 * MongoDB needed. Mirrors the pattern used by testStudent360Service.js.
 *
 * Usage: node src/scripts/testMarksEntryService.js
 */
const assert = require('assert');

const repoPath = require.resolve('../repositories/examRepository');
const stub = {};
require.cache[repoPath] = { id: repoPath, filename: repoPath, loaded: true, exports: stub };

const MarksEntryService = require('../services/marksEntryService');

const SCHOOL_ID = 'school-1';
const EXAM_ID = 'exam-1';
const EXAM_SUBJECT_ID = 'es-1';
const USER_ID = 'user-1';

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.message}`);
    process.exitCode = 1;
  }
};

const resetStub = () => {
  stub.findExamSubjectById = async () => ({
    _id: EXAM_SUBJECT_ID, schoolId: SCHOOL_ID, examId: EXAM_ID,
    academicYearId: 'ay-2026', gradeId: 'grade-8', subjectId: 'subj-math',
    maxMarks: 100, passMarks: 35, marksVerifiedAt: null,
  });
  stub.findExamById = async () => ({ _id: EXAM_ID, schoolId: SCHOOL_ID, status: 'ONGOING' });
  stub.getEnrolledStudentsForGrade = async () => ([
    { studentId: { _id: 'stu-1', firstName: 'Ada', lastName: 'Lovelace' } },
    { studentId: { _id: 'stu-2', firstName: 'Grace', lastName: 'Hopper' } },
  ]);
  stub.listStudentMarksForExamSubject = async () => ([]);
  stub.bulkUpsertStudentMarks = async (schoolId, examSubjectId, rows) => ({
    savedStudentIds: rows.map((r) => String(r.studentId)),
    conflicts: [],
  });
  stub.clearExamSubjectVerification = async () => ({});
  stub.markExamSubjectVerified = async () => ({ marksVerifiedAt: new Date(), marksVerifiedBy: USER_ID });
};

async function run() {
  console.log('\n--- MarksEntryService regression tests ---\n');

  // --- saveMarksBatch: exactly-one-of validation ---
  await test('saveMarksBatch: a row with both marksObtained and isAbsent set is rejected', async () => {
    resetStub();
    await assert.rejects(
      () => MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
        { studentId: 'stu-1', marksObtained: 80, isAbsent: true },
      ]),
      (err) => err.statusCode === 400 && err.errors?.[0]?.studentId === 'stu-1'
    );
  });

  await test('saveMarksBatch: a row with none of marksObtained/isAbsent/isExempted set is rejected', async () => {
    resetStub();
    await assert.rejects(
      () => MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
        { studentId: 'stu-1' },
      ]),
      (err) => err.statusCode === 400
    );
  });

  await test('saveMarksBatch: isExempted alone (no marksObtained) is valid', async () => {
    resetStub();
    const result = await MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
      { studentId: 'stu-1', isExempted: true },
    ]);
    assert.deepStrictEqual(result.saved, ['stu-1']);
  });

  await test('saveMarksBatch: marksObtained alone (no absent/exempted flags) is valid', async () => {
    resetStub();
    const result = await MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
      { studentId: 'stu-1', marksObtained: 72 },
    ]);
    assert.deepStrictEqual(result.saved, ['stu-1']);
  });

  // --- saveMarksBatch: bounds against maxMarks ---
  await test('saveMarksBatch: marksObtained above maxMarks is rejected', async () => {
    resetStub();
    await assert.rejects(
      () => MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
        { studentId: 'stu-1', marksObtained: 150 },
      ]),
      (err) => err.statusCode === 400
    );
  });

  await test('saveMarksBatch: negative marksObtained is rejected', async () => {
    resetStub();
    await assert.rejects(
      () => MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
        { studentId: 'stu-1', marksObtained: -5 },
      ]),
      (err) => err.statusCode === 400
    );
  });

  await test('saveMarksBatch: marksObtained exactly equal to maxMarks is valid (boundary)', async () => {
    resetStub();
    const result = await MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
      { studentId: 'stu-1', marksObtained: 100 },
    ]);
    assert.deepStrictEqual(result.saved, ['stu-1']);
  });

  await test('saveMarksBatch: a batch is rejected all-or-nothing — one bad row blocks the whole batch', async () => {
    resetStub();
    let bulkUpsertCalled = false;
    stub.bulkUpsertStudentMarks = async () => { bulkUpsertCalled = true; return { savedStudentIds: [], conflicts: [] }; };

    await assert.rejects(
      () => MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
        { studentId: 'stu-1', marksObtained: 80 },
        { studentId: 'stu-2', marksObtained: 999 },
      ]),
      (err) => err.statusCode === 400
    );
    assert.strictEqual(bulkUpsertCalled, false);
  });

  // --- saveMarksBatch: exam status guard ---
  await test('saveMarksBatch: rejects when the exam is LOCKED, regardless of row validity', async () => {
    resetStub();
    stub.findExamById = async () => ({ _id: EXAM_ID, schoolId: SCHOOL_ID, status: 'LOCKED' });

    await assert.rejects(
      () => MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
        { studentId: 'stu-1', marksObtained: 80 },
      ]),
      (err) => err.statusCode === 400 && err.message === 'Exam is locked'
    );
  });

  // --- saveMarksBatch: editing after verify clears verification ---
  await test('saveMarksBatch: clears marksVerifiedAt/marksVerifiedBy when re-saving an already-verified exam subject', async () => {
    resetStub();
    stub.findExamSubjectById = async () => ({
      _id: EXAM_SUBJECT_ID, schoolId: SCHOOL_ID, examId: EXAM_ID,
      academicYearId: 'ay-2026', gradeId: 'grade-8', subjectId: 'subj-math',
      maxMarks: 100, passMarks: 35, marksVerifiedAt: new Date(), marksVerifiedBy: USER_ID,
    });
    let cleared = false;
    stub.clearExamSubjectVerification = async () => { cleared = true; };

    await MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
      { studentId: 'stu-1', marksObtained: 80 },
    ]);
    assert.strictEqual(cleared, true);
  });

  await test('saveMarksBatch: does NOT touch verification when the exam subject was never verified', async () => {
    resetStub();
    let cleared = false;
    stub.clearExamSubjectVerification = async () => { cleared = true; };

    await MarksEntryService.saveMarksBatch(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID, [
      { studentId: 'stu-1', marksObtained: 80 },
    ]);
    assert.strictEqual(cleared, false);
  });

  // --- verifyExamSubjectMarks: missing-student detection ---
  await test('verifyExamSubjectMarks: blocks when an enrolled student has no StudentMark row at all', async () => {
    resetStub();
    stub.listStudentMarksForExamSubject = async () => ([
      { studentId: 'stu-1', marksObtained: 80 },
      // stu-2 has no mark row -> should block
    ]);

    await assert.rejects(
      () => MarksEntryService.verifyExamSubjectMarks(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID),
      (err) => err.statusCode === 400 && err.errors?.[0]?.studentId === 'stu-2' && err.errors[0].reason === 'No marks entered'
    );
  });

  await test('verifyExamSubjectMarks: a student marked absent/exempted counts as touched (does not block)', async () => {
    resetStub();
    stub.listStudentMarksForExamSubject = async () => ([
      { studentId: 'stu-1', marksObtained: 80 },
      { studentId: 'stu-2', isAbsent: true },
    ]);

    const result = await MarksEntryService.verifyExamSubjectMarks(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID);
    assert.ok(result.marksVerifiedAt);
  });

  await test('verifyExamSubjectMarks: succeeds and sets marksVerifiedAt when every enrolled student has a mark row', async () => {
    resetStub();
    stub.listStudentMarksForExamSubject = async () => ([
      { studentId: 'stu-1', marksObtained: 80 },
      { studentId: 'stu-2', marksObtained: 40 },
    ]);

    const result = await MarksEntryService.verifyExamSubjectMarks(SCHOOL_ID, EXAM_SUBJECT_ID, USER_ID);
    assert.ok(result.marksVerifiedAt);
    assert.strictEqual(result.marksVerifiedBy, USER_ID);
  });

  console.log(`\n${passed} test(s) passed.\n`);
}

run();
