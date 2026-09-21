/**
 * Framework-free regression tests for Student360Service, run against
 * in-memory fixtures with the repository layer stubbed out — no live
 * MongoDB needed. Mirrors the pattern used by testTimetableValidator.js /
 * testTimetableGenerator.js.
 *
 * Usage: node src/scripts/testStudent360Service.js
 */
const assert = require('assert');
const path = require('path');

const repoPath = require.resolve('../repositories/student360Repository');
const stub = {};
require.cache[repoPath] = { id: repoPath, filename: repoPath, loaded: true, exports: stub };

const Student360Service = require('../services/student360Service');

const SCHOOL_ID = 'school-1';
const STUDENT_ID = 'student-1';
const AY_2025_ID = 'ay-2025';
const AY_2026_ID = 'ay-2026';

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
  stub.findStudentInSchool = async () => ({ _id: STUDENT_ID, firstName: 'Ada', lastName: 'Lovelace' });
  stub.resolveAcademicYear = async (schoolId, academicYearId) => academicYearId || AY_2026_ID;
  stub.getCurrentEnrollment = async () => ({
    _id: 'enr-2026', academicYearId: { _id: AY_2026_ID, name: '2025-2026' },
    gradeId: { _id: 'grade-8', name: 'Grade 8' }, sectionId: { _id: 'section-8a', name: '8A' },
  });
  stub.getEnrollmentForYear = async () => null;
  stub.getAllEnrollments = async () => ([
    { _id: 'enr-2025', academicYearId: { _id: AY_2025_ID, name: '2024-2025' } },
    { _id: 'enr-2026', academicYearId: { _id: AY_2026_ID, name: '2025-2026' } },
  ]);
  stub.getAcademicHistory = async () => [];
  stub.getGuardians = async () => [];
  stub.getClassTeacher = async () => ({ firstName: 'Grace', lastName: 'Hopper' });
  stub.getAttendanceRecords = async () => ([]);
  stub.getExamResults = async () => ([]);
  stub.getExamResultsAllYears = async () => ([]);
  stub.getInvoices = async () => ([]);
  stub.getConcessions = async () => ([]);
  stub.getClassSubjects = async () => ([]);
  stub.getTeacherAssignmentsForSection = async () => ([]);
  stub.getSectionTimetable = async () => ([]);
  stub.getDocuments = async () => ([]);
  stub.countPendingDocuments = async () => 0;
  stub.getTransportAssignment = async () => ([]);
  stub.getTimeline = async () => ([]);
  stub.getDisciplineIncidents = async () => ([]);
  stub.getDisciplinaryActionsForIncidents = async () => ([]);
  stub.getHealthProfile = async () => null;
  stub.getMedicalVisits = async () => ([]);
};

async function run() {
  console.log('\n--- Student360Service regression tests ---\n');

  // 1. Subjects & Teachers join: ClassSubject x TeacherAssignment by subjectId
  await test('subjects-teachers: joins each ClassSubject with its assigned teacher(s) by subjectId', async () => {
    resetStub();
    stub.getClassSubjects = async () => ([
      { _id: 'cs-math', subjectId: { _id: 'subj-math', name: 'Mathematics' }, weeklyPeriods: 6 },
      { _id: 'cs-sci', subjectId: { _id: 'subj-sci', name: 'Science' }, weeklyPeriods: 5 },
    ]);
    stub.getTeacherAssignmentsForSection = async () => ([
      { subjectId: { _id: 'subj-math' }, staffId: { firstName: 'Ada', lastName: 'L' }, assignmentType: 'PRIMARY', isClassTeacher: false },
      { subjectId: { _id: 'subj-sci' }, staffId: { firstName: 'Grace', lastName: 'H' }, assignmentType: 'PRIMARY', isClassTeacher: true },
    ]);

    // No academicYearId passed -> resolves via getCurrentEnrollment (stubbed to AY 2026)
    const result = await Student360Service.getSubjectsAndTeachers(SCHOOL_ID, STUDENT_ID, undefined);
    assert.strictEqual(result.subjects.length, 2);
    const math = result.subjects.find((s) => s.id === 'cs-math');
    assert.strictEqual(math.teachers.length, 1);
    assert.strictEqual(math.teachers[0].staff.firstName, 'Ada');
    const sci = result.subjects.find((s) => s.id === 'cs-sci');
    assert.strictEqual(sci.teachers[0].isClassTeacher, true);
  });

  await test('subjects-teachers: a subject with no assigned teacher yields an empty teachers array (not a crash)', async () => {
    resetStub();
    stub.getClassSubjects = async () => ([
      { _id: 'cs-art', subjectId: { _id: 'subj-art' }, weeklyPeriods: 2 },
    ]);
    stub.getTeacherAssignmentsForSection = async () => ([]);

    const result = await Student360Service.getSubjectsAndTeachers(SCHOOL_ID, STUDENT_ID, undefined);
    assert.strictEqual(result.subjects[0].teachers.length, 0);
  });

  await test('subjects-teachers: no enrollment for the requested year returns an empty, non-throwing result', async () => {
    resetStub();
    stub.getEnrollmentForYear = async () => null;

    const result = await Student360Service.getSubjectsAndTeachers(SCHOOL_ID, STUDENT_ID, AY_2025_ID);
    assert.strictEqual(result.enrollment, null);
    assert.deepStrictEqual(result.subjects, []);
  });

  // 2. Attendance aggregation
  await test('attendance: computes percentage and per-status counts correctly', async () => {
    resetStub();
    stub.getAttendanceRecords = async () => ([
      { statusId: { countsAsPresent: true, code: 'PRESENT' } },
      { statusId: { countsAsPresent: true, code: 'PRESENT' } },
      { statusId: { countsAsAbsent: true, code: 'ABSENT' } },
      { statusId: { countsAsPresent: true, code: 'LATE' } },
      { statusId: { code: 'EXCUSED' } },
    ]);

    const result = await Student360Service.getAttendance(SCHOOL_ID, STUDENT_ID, AY_2026_ID);
    assert.strictEqual(result.totalDays, 5);
    assert.strictEqual(result.presentCount, 3);
    assert.strictEqual(result.absentCount, 1);
    assert.strictEqual(result.lateCount, 1);
    assert.strictEqual(result.excusedCount, 1);
    assert.strictEqual(result.attendancePercentage, 60);
  });

  await test('attendance: zero records yields null percentage, not NaN or a divide-by-zero crash', async () => {
    resetStub();
    stub.getAttendanceRecords = async () => ([]);

    const result = await Student360Service.getAttendance(SCHOOL_ID, STUDENT_ID, AY_2026_ID);
    assert.strictEqual(result.totalDays, 0);
    assert.strictEqual(result.attendancePercentage, null);
  });

  // 3. Finance aggregation
  await test('finance: sums totalAmount/paidAmount/balanceAmount across multiple invoices', async () => {
    resetStub();
    stub.getInvoices = async () => ([
      { totalAmount: 10000, paidAmount: 10000, balanceAmount: 0 },
      { totalAmount: 5000, paidAmount: 2000, balanceAmount: 3000 },
      { totalAmount: 2500, paidAmount: 0, balanceAmount: 2500 },
    ]);

    const result = await Student360Service.getFinance(SCHOOL_ID, STUDENT_ID, AY_2026_ID);
    assert.strictEqual(result.totals.totalAmount, 17500);
    assert.strictEqual(result.totals.paidAmount, 12000);
    assert.strictEqual(result.totals.balanceAmount, 5500);
  });

  await test('finance: no invoices yields zeroed totals, not undefined', async () => {
    resetStub();
    stub.getInvoices = async () => ([]);

    const result = await Student360Service.getFinance(SCHOOL_ID, STUDENT_ID, AY_2026_ID);
    assert.deepStrictEqual(result.totals, { totalAmount: 0, paidAmount: 0, balanceAmount: 0 });
  });

  // 4. Performance trend grouping
  await test('performance-trend: groups exam results by academic year and averages percentage per year', async () => {
    resetStub();
    stub.getExamResultsAllYears = async () => ([
      { academicYearId: { _id: AY_2025_ID, name: '2024-2025' }, percentage: 80 },
      { academicYearId: { _id: AY_2025_ID, name: '2024-2025' }, percentage: 90 },
      { academicYearId: { _id: AY_2026_ID, name: '2025-2026' }, percentage: 70 },
    ]);

    const result = await Student360Service.getPerformanceTrend(SCHOOL_ID, STUDENT_ID);
    assert.strictEqual(result.length, 2);
    const y2025 = result.find((r) => r.academicYearId === AY_2025_ID);
    assert.strictEqual(y2025.averagePercentage, 85);
    const y2026 = result.find((r) => r.academicYearId === AY_2026_ID);
    assert.strictEqual(y2026.averagePercentage, 70);
    // sorted by academic year name ascending
    assert.strictEqual(result[0].academicYearName, '2024-2025');
  });

  // 5. Overview KPIs
  await test('overview: derives attendance%, average%, fee balance and distinct-years count from the current year only', async () => {
    resetStub();
    stub.getAttendanceRecords = async () => ([
      { statusId: { countsAsPresent: true } },
      { statusId: { countsAsPresent: true } },
      { statusId: { countsAsAbsent: true } },
      { statusId: { countsAsAbsent: true } },
    ]);
    stub.getExamResultsAllYears = async () => ([
      { academicYearId: AY_2025_ID, percentage: 60 }, // a prior year — must NOT be included
      { academicYearId: AY_2026_ID, percentage: 80 },
      { academicYearId: AY_2026_ID, percentage: 90 },
    ]);
    stub.getInvoices = async () => ([
      { balanceAmount: 1200 },
      { balanceAmount: 300 },
    ]);
    stub.countPendingDocuments = async () => 2;

    const result = await Student360Service.getOverview(SCHOOL_ID, STUDENT_ID);
    assert.strictEqual(result.kpis.attendancePercentage, 50);
    assert.strictEqual(result.kpis.averagePercentage, 85);
    assert.strictEqual(result.kpis.feeBalance, 1500);
    assert.strictEqual(result.kpis.totalYearsEnrolled, 2);
    assert.strictEqual(result.kpis.pendingDocuments, 2);
    assert.strictEqual(result.classTeacher.firstName, 'Grace');
  });

  await test('overview: a student with no current enrollment yet (e.g. a freshly-admitted applicant) does not crash', async () => {
    resetStub();
    stub.getCurrentEnrollment = async () => null;

    const result = await Student360Service.getOverview(SCHOOL_ID, STUDENT_ID);
    assert.strictEqual(result.currentEnrollment, null);
    assert.strictEqual(result.kpis.attendancePercentage, null);
    assert.strictEqual(result.kpis.averagePercentage, null);
    assert.strictEqual(result.kpis.feeBalance, 0);
  });

  // 6. Discipline: incident/action join
  await test('discipline: nests each incident\'s disciplinary actions under it, grouped by incidentId', async () => {
    resetStub();
    stub.getDisciplineIncidents = async () => ([
      { _id: 'inc-1', category: 'BEHAVIORAL', severity: 'MEDIUM', description: 'Late to class repeatedly', status: 'OPEN' },
      { _id: 'inc-2', category: 'ACADEMIC_INTEGRITY', severity: 'HIGH', description: 'Copying in exam', status: 'RESOLVED' },
    ]);
    stub.getDisciplinaryActionsForIncidents = async () => ([
      { _id: 'act-1', incidentId: 'inc-1', actionType: 'WARNING', actionDate: '2026-02-01' },
      { _id: 'act-2', incidentId: 'inc-2', actionType: 'PARENT_MEETING', actionDate: '2026-02-05' },
      { _id: 'act-3', incidentId: 'inc-2', actionType: 'DETENTION', actionDate: '2026-02-10' },
    ]);

    const result = await Student360Service.getDiscipline(SCHOOL_ID, STUDENT_ID);
    assert.strictEqual(result.length, 2);
    const inc1 = result.find((i) => i.id === 'inc-1');
    assert.strictEqual(inc1.actions.length, 1);
    assert.strictEqual(inc1.actions[0].actionType, 'WARNING');
    const inc2 = result.find((i) => i.id === 'inc-2');
    assert.strictEqual(inc2.actions.length, 2);
  });

  await test('discipline: an incident with no recorded action yields an empty actions array, not a crash', async () => {
    resetStub();
    stub.getDisciplineIncidents = async () => ([{ _id: 'inc-1', description: 'Minor', status: 'OPEN' }]);
    stub.getDisciplinaryActionsForIncidents = async () => ([]);

    const result = await Student360Service.getDiscipline(SCHOOL_ID, STUDENT_ID);
    assert.strictEqual(result[0].actions.length, 0);
  });

  await test('discipline: a clean record (no incidents) short-circuits without ever querying actions', async () => {
    resetStub();
    let actionsQueried = false;
    stub.getDisciplineIncidents = async () => ([]);
    stub.getDisciplinaryActionsForIncidents = async () => { actionsQueried = true; return []; };

    const result = await Student360Service.getDiscipline(SCHOOL_ID, STUDENT_ID);
    assert.deepStrictEqual(result, []);
    assert.strictEqual(actionsQueried, false);
  });

  // 7. Medical
  await test('medical: returns the health profile and visit history together', async () => {
    resetStub();
    stub.getHealthProfile = async () => ({ _id: 'hp-1', bloodGroup: 'O+', allergies: ['Peanuts'] });
    stub.getMedicalVisits = async () => ([
      { _id: 'visit-1', visitDate: '2026-03-01', reason: 'Fever' },
    ]);

    const result = await Student360Service.getMedical(SCHOOL_ID, STUDENT_ID);
    assert.strictEqual(result.healthProfile.id, 'hp-1');
    assert.strictEqual(result.healthProfile.bloodGroup, 'O+');
    assert.strictEqual(result.visits.length, 1);
    assert.strictEqual(result.visits[0].id, 'visit-1');
  });

  await test('medical: a student with no health profile on file yet returns null, not a crash', async () => {
    resetStub();
    stub.getHealthProfile = async () => null;
    stub.getMedicalVisits = async () => ([]);

    const result = await Student360Service.getMedical(SCHOOL_ID, STUDENT_ID);
    assert.strictEqual(result.healthProfile, null);
    assert.deepStrictEqual(result.visits, []);
  });

  // 8. Tenant isolation
  await test('every tab method throws NotFoundError when the student does not belong to this school', async () => {
    resetStub();
    stub.findStudentInSchool = async () => null;

    await assert.rejects(
      () => Student360Service.getOverview(SCHOOL_ID, 'someone-elses-student'),
      (err) => err.statusCode === 404
    );
    await assert.rejects(() => Student360Service.getAttendance(SCHOOL_ID, STUDENT_ID, AY_2026_ID));
    await assert.rejects(() => Student360Service.getFinance(SCHOOL_ID, STUDENT_ID, AY_2026_ID));
    await assert.rejects(() => Student360Service.getDiscipline(SCHOOL_ID, STUDENT_ID));
    await assert.rejects(() => Student360Service.getMedical(SCHOOL_ID, STUDENT_ID));
  });

  console.log(`\n${passed} test(s) passed.\n`);
}

run();
