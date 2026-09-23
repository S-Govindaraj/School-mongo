/**
 * Framework-free regression tests for resultCorrectionService's state
 * machine, run against in-memory stubs for every DB-touching dependency
 * (examRepository, the ResultCorrection/Enrollment/ExamResult models, and
 * gradingSchemeService) — no live MongoDB needed. Uses the same
 * require.cache-injection stubbing technique as testStudent360Service.js /
 * testGradingSchemeService.js.
 *
 * Usage: node src/scripts/testResultCorrectionStateMachine.js
 */
const assert = require('assert');

const stubModule = (relativePath) => {
  const resolved = require.resolve(relativePath);
  const stub = {};
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: stub };
  return stub;
};

const examRepositoryStub = stubModule('../repositories/examRepository');
const resultCorrectionModelStub = stubModule('../models/ResultCorrection');
const examResultModelStub = stubModule('../models/ExamResult');
const enrollmentModelStub = stubModule('../models/Enrollment');
const gradingSchemeServiceStub = stubModule('../services/gradingSchemeService');

const resultCorrectionService = require('../services/resultCorrectionService');

const SCHOOL_ID = 'school-1';
const USER_ID = 'user-1';
const EXAM_ID = 'exam-1';
const EXAM_SUBJECT_ID = 'exam-subject-1';
const STUDENT_ID = 'student-1';
const CORRECTION_ID = 'correction-1';

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

// A fake Mongoose document: plain object plus a `.save()` that just resolves
// with itself, so the service's `correction.status = ...; await correction.save();`
// pattern works without a real model.
const makeFakeCorrection = (overrides = {}) => ({
  _id: CORRECTION_ID,
  schoolId: SCHOOL_ID,
  examId: EXAM_ID,
  examSubjectId: EXAM_SUBJECT_ID,
  studentId: STUDENT_ID,
  status: 'PENDING',
  requestedValue: { marksObtained: 88 },
  save: async function save() { return this; },
  ...overrides,
});

const resetStubs = () => {
  examRepositoryStub.findExamById = async () => ({ _id: EXAM_ID, status: 'LOCKED', title: 'Term 1 Final', examType: 'FINAL', academicYearId: 'ay-1', academicTermId: 'at-1' });
  examRepositoryStub.findExamSubjectById = async () => ({ _id: EXAM_SUBJECT_ID, maxMarks: 100, hasTheoryPractical: false, subjectId: 'subj-1' });
  examRepositoryStub.findStudentMark = async () => null;
  examRepositoryStub.applyCorrectionToStudentMark = async () => ({ marksObtained: 88, isAbsent: false, isExempted: false });

  resultCorrectionModelStub.create = async (doc) => makeFakeCorrection(doc);
  resultCorrectionModelStub.findOne = async () => makeFakeCorrection();

  examResultModelStub.findOneAndUpdate = async () => ({});

  enrollmentModelStub.findOne = () => ({ lean: async () => ({ gradeId: 'grade-1', sectionId: 'section-1' }) });

  gradingSchemeServiceStub.getThresholds = async () => ([{ min: 90, grade: 'A+' }, { min: 0, grade: 'F' }]);
};

async function run() {
  console.log('\n--- resultCorrectionService state machine regression tests ---\n');

  await test('requestCorrection on a non-LOCKED exam throws', async () => {
    resetStubs();
    examRepositoryStub.findExamById = async () => ({ _id: EXAM_ID, status: 'PUBLISHED' });
    await assert.rejects(
      () => resultCorrectionService.requestCorrection(SCHOOL_ID, USER_ID, {
        examId: EXAM_ID, examSubjectId: EXAM_SUBJECT_ID, studentId: STUDENT_ID,
        requestedValue: { marksObtained: 88 }, reason: 'Re-checked answer sheet',
      }),
      (err) => err.statusCode === 400
    );
  });

  await test('requestCorrection on a LOCKED exam with no prior StudentMark succeeds with an empty previousValue', async () => {
    resetStubs();
    let createdDoc = null;
    resultCorrectionModelStub.create = async (doc) => { createdDoc = doc; return makeFakeCorrection(doc); };

    const correction = await resultCorrectionService.requestCorrection(SCHOOL_ID, USER_ID, {
      examId: EXAM_ID, examSubjectId: EXAM_SUBJECT_ID, studentId: STUDENT_ID,
      requestedValue: { marksObtained: 88 }, reason: 'Student missed during original entry',
    });
    assert.strictEqual(correction.status, 'PENDING');
    assert.deepStrictEqual(createdDoc.previousValue, {});
  });

  await test('approveCorrection on a non-PENDING correction throws', async () => {
    resetStubs();
    resultCorrectionModelStub.findOne = async () => makeFakeCorrection({ status: 'APPLIED' });
    await assert.rejects(
      () => resultCorrectionService.approveCorrection(SCHOOL_ID, CORRECTION_ID, USER_ID),
      (err) => err.statusCode === 400
    );
  });

  await test('rejectCorrection on a non-PENDING correction throws', async () => {
    resetStubs();
    resultCorrectionModelStub.findOne = async () => makeFakeCorrection({ status: 'REJECTED' });
    await assert.rejects(
      () => resultCorrectionService.rejectCorrection(SCHOOL_ID, CORRECTION_ID, USER_ID, 'already handled'),
      (err) => err.statusCode === 400
    );
  });

  await test('approveCorrection on a missing correction throws NotFoundError', async () => {
    resetStubs();
    resultCorrectionModelStub.findOne = async () => null;
    await assert.rejects(
      () => resultCorrectionService.approveCorrection(SCHOOL_ID, 'missing-id', USER_ID),
      (err) => err.statusCode === 404
    );
  });

  await test('a successful approve transitions PENDING -> APPLIED and upserts ExamResult with the {schoolId, examSubjectId, studentId} key', async () => {
    resetStubs();
    const fake = makeFakeCorrection({ requestedValue: { marksObtained: 95 } });
    resultCorrectionModelStub.findOne = async () => fake;

    let upsertFilter = null;
    let upsertSet = null;
    examResultModelStub.findOneAndUpdate = async (filter, update, opts) => {
      upsertFilter = filter;
      upsertSet = update.$set;
      assert.strictEqual(opts.upsert, true);
      return { ...upsertSet };
    };

    let appliedNewValues = null;
    examRepositoryStub.applyCorrectionToStudentMark = async (schoolId, examSubjectId, studentId, newValues) => {
      appliedNewValues = newValues;
      return { marksObtained: 95, isAbsent: false, isExempted: false };
    };

    const result = await resultCorrectionService.approveCorrection(SCHOOL_ID, CORRECTION_ID, USER_ID);

    assert.strictEqual(result.status, 'APPLIED');
    assert.ok(result.appliedAt instanceof Date);
    assert.strictEqual(result.reviewedBy, USER_ID);

    // The most correctness-critical detail: same upsert key resultService.publishResults uses.
    assert.deepStrictEqual(upsertFilter, { schoolId: SCHOOL_ID, examSubjectId: EXAM_SUBJECT_ID, studentId: STUDENT_ID });
    assert.strictEqual(upsertSet.status, 'PUBLISHED');
    assert.strictEqual(upsertSet.totalObtained, 95);
    assert.strictEqual(upsertSet.grade, 'A+');
    assert.strictEqual(appliedNewValues.marksObtained, 95);
  });

  await test('a successful reject transitions PENDING -> REJECTED and records reviewNotes', async () => {
    resetStubs();
    const fake = makeFakeCorrection();
    resultCorrectionModelStub.findOne = async () => fake;

    const result = await resultCorrectionService.rejectCorrection(SCHOOL_ID, CORRECTION_ID, USER_ID, 'Insufficient evidence');
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.reviewNotes, 'Insufficient evidence');
    assert.strictEqual(result.reviewedBy, USER_ID);
    assert.ok(result.reviewedAt instanceof Date);
  });

  console.log(`\n${passed} test(s) passed.\n`);
}

run();
