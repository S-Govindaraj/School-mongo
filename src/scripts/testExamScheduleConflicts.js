/**
 * Framework-free regression tests for ExamScheduleService.detectConflicts,
 * run against in-memory fixtures with the repository layer stubbed out — no
 * live MongoDB needed. Mirrors the pattern used by testStudent360Service.js.
 *
 * Usage: node src/scripts/testExamScheduleConflicts.js
 */
const assert = require('assert');

const repoPath = require.resolve('../repositories/examRepository');
const stub = {};
require.cache[repoPath] = { id: repoPath, filename: repoPath, loaded: true, exports: stub };

const ExamScheduleService = require('../services/examScheduleService');

const SCHOOL_ID = 'school-1';
const EXAM_ID = 'exam-1';

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
  stub.findExamById = async () => ({ _id: EXAM_ID, schoolId: SCHOOL_ID, status: 'DRAFT' });
  stub.listExamSubjects = async () => ([]);
  stub.updateExam = async (schoolId, examId, updates) => ({ _id: examId, ...updates });
};

async function run() {
  console.log('\n--- ExamScheduleService.detectConflicts regression tests ---\n');

  await test('same invigilator, same date, overlapping times -> 1 INVIGILATOR_CONFLICT', async () => {
    resetStub();
    stub.listExamSubjects = async () => ([
      { _id: 'es-1', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: '2026-03-05', startTime: '09:00', endTime: '10:00' },
      { _id: 'es-2', invigilatorStaffId: 'staff-1', gradeId: 'grade-9', examDate: '2026-03-05', startTime: '09:30', endTime: '10:30' },
    ]);

    const { conflicts } = await ExamScheduleService.detectConflicts(SCHOOL_ID, EXAM_ID);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].type, 'INVIGILATOR_CONFLICT');
    assert.deepStrictEqual(conflicts[0].examSubjectIds.sort(), ['es-1', 'es-2']);
  });

  await test('same invigilator, same date, non-overlapping times -> 0 conflicts', async () => {
    resetStub();
    stub.listExamSubjects = async () => ([
      { _id: 'es-1', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: '2026-03-05', startTime: '09:00', endTime: '10:00' },
      { _id: 'es-2', invigilatorStaffId: 'staff-1', gradeId: 'grade-9', examDate: '2026-03-05', startTime: '10:00', endTime: '11:00' },
    ]);

    const { conflicts } = await ExamScheduleService.detectConflicts(SCHOOL_ID, EXAM_ID);
    assert.strictEqual(conflicts.length, 0);
  });

  await test('two subjects same grade, overlapping times -> 1 GRADE_CONFLICT', async () => {
    resetStub();
    stub.listExamSubjects = async () => ([
      { _id: 'es-1', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: '2026-03-05', startTime: '10:00', endTime: '11:00' },
      { _id: 'es-2', invigilatorStaffId: 'staff-2', gradeId: 'grade-8', examDate: '2026-03-05', startTime: '10:30', endTime: '11:30' },
    ]);

    const { conflicts } = await ExamScheduleService.detectConflicts(SCHOOL_ID, EXAM_ID);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].type, 'GRADE_CONFLICT');
  });

  await test('completely disjoint subjects (different invigilator, grade, date) -> 0 conflicts', async () => {
    resetStub();
    stub.listExamSubjects = async () => ([
      { _id: 'es-1', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: '2026-03-05', startTime: '09:00', endTime: '10:00' },
      { _id: 'es-2', invigilatorStaffId: 'staff-2', gradeId: 'grade-9', examDate: '2026-03-06', startTime: '09:00', endTime: '10:00' },
    ]);

    const { conflicts } = await ExamScheduleService.detectConflicts(SCHOOL_ID, EXAM_ID);
    assert.strictEqual(conflicts.length, 0);
  });

  await test('same invigilator/grade but different dates -> 0 conflicts', async () => {
    resetStub();
    stub.listExamSubjects = async () => ([
      { _id: 'es-1', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: '2026-03-05', startTime: '09:00', endTime: '10:00' },
      { _id: 'es-2', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: '2026-03-06', startTime: '09:00', endTime: '10:00' },
    ]);

    const { conflicts } = await ExamScheduleService.detectConflicts(SCHOOL_ID, EXAM_ID);
    assert.strictEqual(conflicts.length, 0);
  });

  await test('a lone exam subject with no invigilator/grade partner never conflicts with itself', async () => {
    resetStub();
    stub.listExamSubjects = async () => ([
      { _id: 'es-1', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: '2026-03-05', startTime: '09:00', endTime: '10:00' },
    ]);

    const { conflicts } = await ExamScheduleService.detectConflicts(SCHOOL_ID, EXAM_ID);
    assert.strictEqual(conflicts.length, 0);
  });

  await test('confirmSchedule rejects when an exam subject is missing date/time/room', async () => {
    resetStub();
    stub.listExamSubjects = async () => ([
      { _id: 'es-1', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: null, startTime: null, endTime: null, room: '' },
    ]);

    await assert.rejects(
      () => ExamScheduleService.confirmSchedule(SCHOOL_ID, EXAM_ID),
      (err) => err.statusCode === 400
    );
  });

  await test('confirmSchedule rejects when conflicts are present, and passes them through as errors', async () => {
    resetStub();
    stub.listExamSubjects = async () => ([
      { _id: 'es-1', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: '2026-03-05', startTime: '09:00', endTime: '10:00', room: 'R1' },
      { _id: 'es-2', invigilatorStaffId: 'staff-1', gradeId: 'grade-9', examDate: '2026-03-05', startTime: '09:30', endTime: '10:30', room: 'R2' },
    ]);

    await assert.rejects(
      () => ExamScheduleService.confirmSchedule(SCHOOL_ID, EXAM_ID),
      (err) => err.statusCode === 400 && err.errors && err.errors.length === 1
    );
  });

  await test('confirmSchedule succeeds and transitions DRAFT -> SCHEDULED when fully scheduled with no conflicts', async () => {
    resetStub();
    stub.listExamSubjects = async () => ([
      { _id: 'es-1', invigilatorStaffId: 'staff-1', gradeId: 'grade-8', examDate: '2026-03-05', startTime: '09:00', endTime: '10:00', room: 'R1' },
      { _id: 'es-2', invigilatorStaffId: 'staff-2', gradeId: 'grade-9', examDate: '2026-03-06', startTime: '09:00', endTime: '10:00', room: 'R2' },
    ]);

    const result = await ExamScheduleService.confirmSchedule(SCHOOL_ID, EXAM_ID);
    assert.strictEqual(result.status, 'SCHEDULED');
  });

  console.log(`\n${passed} test(s) passed.\n`);
}

run();
