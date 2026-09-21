// Lightweight, framework-free regression checks for the Smart Timetable
// Generator's CSP core (src/services/timetableGeneratorService.js). Exercises
// the algorithm directly against an in-memory TimetableWorkingContext, so it
// runs with no database. Extend with more scenarios as the generator grows;
// migrate to a real test runner once one is added to this backend.
//
// Run: node src/scripts/testTimetableGenerator.js
const assert = require('assert');
const { _internal } = require('../services/timetableGeneratorService');
const { TimetableWorkingContext } = require('../services/timetableValidatorService');
const { buildSlotDomain, runGeneration } = _internal;

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const periods = (count = 8) => Array.from({ length: count }, (_, i) => ({ _id: `p${i + 1}`, sequence: i + 1, isBreak: false }));

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

// --- Scenario 1: the spec's own acceptance example (Section 59) -----------
// 5 days x 8 periods = 40 slots; 7 subjects totaling 30 required periods.
(function acceptanceExample() {
  console.log('\nScenario: acceptance example (7 subjects, 30/40 periods)');
  const ps = periods(8);
  const ctx = new TimetableWorkingContext({ schoolId: 's1', academicYearId: 'ay1' });
  ps.forEach((p) => ctx.periods.set(p._id, p));
  ctx.grades.set('g8', { _id: 'g8', status: 'ACTIVE' });
  ctx.sections.set('sec8a', { _id: 'sec8a', gradeId: 'g8', status: 'ACTIVE' });

  const subjectSpecs = [
    { id: 'math', name: 'Mathematics', teacher: 'john', weekly: 6 },
    { id: 'sci', name: 'Science', teacher: 'david', weekly: 5 },
    { id: 'eng', name: 'English', teacher: 'sarah', weekly: 5 },
    { id: 'tam', name: 'Tamil', teacher: 'kumar', weekly: 4 },
    { id: 'soc', name: 'Social', teacher: 'ravi', weekly: 5 },
    { id: 'comp', name: 'Computer', teacher: 'priya', weekly: 3 },
    { id: 'pe', name: 'PE', teacher: 'arun', weekly: 2 },
  ];
  subjectSpecs.forEach((s) => {
    ctx.subjects.set(s.id, { _id: s.id, name: s.name, status: 'ACTIVE', type: 'CORE' });
    ctx.classSubjects.set(`g8|${s.id}`, { gradeId: 'g8', subjectId: s.id, weeklyPeriods: s.weekly });
    ctx.staffById.set(s.teacher, { _id: s.teacher, status: 'ACTIVE', firstName: s.teacher, lastName: '', unavailability: [] });
    ctx.teacherAssignments.set(`sec8a|${s.id}|${s.teacher}`, { sectionId: 'sec8a', subjectId: s.id, staffId: s.teacher });
  });

  const variables = [];
  subjectSpecs.forEach((s) => {
    for (let i = 0; i < s.weekly; i++) {
      variables.push({ id: `sec8a:${s.id}:${i}`, sectionId: 'sec8a', sectionName: '8A', gradeId: 'g8', subjectId: s.id, subjectName: s.name, teacherId: s.teacher, isDouble: false, weeklyPeriods: s.weekly });
    }
  });

  const { singles, doubles } = buildSlotDomain(DAYS, ps);
  test('40 available slots computed (5 days x 8 periods)', () => assert.strictEqual(singles.length, 40));

  const result = runGeneration({ variables, singles, doubles, ctx, academicYearId: 'ay1', constraints: { maxConsecutivePerSubject: 2, minGapPeriods: 0, distributionWeight: 5, preferredPeriodsWeight: 3 }, requestSeed: 'acceptance-example' });

  test('all 30 requirements placed, none unscheduled', () => {
    assert.strictEqual(result.stats.placed, 30);
    assert.strictEqual(result.unscheduled.length, 0);
  });

  test('no section double-booking', () => {
    const seen = new Set();
    result.slots.forEach((s) => {
      const key = `${s.sectionId}|${s.dayOfWeek}|${s.periodId}`;
      assert.ok(!seen.has(key), `duplicate section slot ${key}`);
      seen.add(key);
    });
  });

  test('no teacher double-booking', () => {
    const seen = new Set();
    result.slots.forEach((s) => {
      const key = `${s.teacherId}|${s.dayOfWeek}|${s.periodId}`;
      assert.ok(!seen.has(key), `duplicate teacher slot ${key}`);
      seen.add(key);
    });
  });

  test('every subject placed exactly its weekly period count', () => {
    const counts = {};
    result.slots.forEach((s) => { counts[s.subjectId] = (counts[s.subjectId] || 0) + 1; });
    subjectSpecs.forEach((s) => assert.strictEqual(counts[s.id] || 0, s.weekly, `${s.name} expected ${s.weekly}`));
  });

  test('high-frequency subjects are spread across >=3 distinct days, not dumped on 1-2 days', () => {
    subjectSpecs.filter((s) => s.weekly >= 4).forEach((s) => {
      const days = new Set(result.slots.filter((sl) => sl.subjectId === s.id).map((sl) => sl.dayOfWeek));
      assert.ok(days.size >= 3, `${s.name} only spread across ${days.size} day(s)`);
    });
  });
})();

// --- Scenario 2: teacher unavailability is a genuine hard constraint ------
(function teacherUnavailability() {
  console.log('\nScenario: teacher unavailable Wednesday & Friday (hard constraint)');
  const ps = periods(8);
  const ctx = new TimetableWorkingContext({ schoolId: 's1', academicYearId: 'ay1' });
  ps.forEach((p) => ctx.periods.set(p._id, p));
  ctx.grades.set('g8', { _id: 'g8', status: 'ACTIVE' });
  ctx.sections.set('sec8a', { _id: 'sec8a', gradeId: 'g8', status: 'ACTIVE' });
  ctx.subjects.set('math', { _id: 'math', name: 'Mathematics', status: 'ACTIVE', type: 'CORE' });
  ctx.classSubjects.set('g8|math', { gradeId: 'g8', subjectId: 'math', weeklyPeriods: 6 });
  ctx.staffById.set('john', { _id: 'john', status: 'ACTIVE', firstName: 'John', lastName: 'Smith', unavailability: [{ dayOfWeek: 'WEDNESDAY', periods: [] }, { dayOfWeek: 'FRIDAY', periods: [] }] });
  ctx.teacherAssignments.set('sec8a|math|john', { sectionId: 'sec8a', subjectId: 'math', staffId: 'john' });

  const variables = Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, sectionId: 'sec8a', sectionName: '8A', gradeId: 'g8', subjectId: 'math', subjectName: 'Mathematics', teacherId: 'john', isDouble: false, weeklyPeriods: 6 }));
  const { singles, doubles } = buildSlotDomain(DAYS, ps);
  const result = runGeneration({ variables, singles, doubles, ctx, academicYearId: 'ay1', constraints: { maxConsecutivePerSubject: 2, minGapPeriods: 0, distributionWeight: 5, preferredPeriodsWeight: 3 }, requestSeed: 'unavailability-test' });

  test('all 6 periods still placed by using the remaining days', () => assert.strictEqual(result.stats.placed, 6));
  test('never scheduled on the teacher\'s unavailable days', () => {
    assert.ok(!result.slots.some((s) => s.dayOfWeek === 'WEDNESDAY'), 'placed on Wednesday');
    assert.ok(!result.slots.some((s) => s.dayOfWeek === 'FRIDAY'), 'placed on Friday');
  });
})();

// --- Scenario 3: locked slots are immutable and count toward the weekly target ---
(function lockedSlotsRespected() {
  console.log('\nScenario: a locked slot is never overwritten and reduces the remaining requirement');
  const ps = periods(8);
  const ctx = new TimetableWorkingContext({ schoolId: 's1', academicYearId: 'ay1' });
  ps.forEach((p) => ctx.periods.set(p._id, p));
  ctx.grades.set('g8', { _id: 'g8', status: 'ACTIVE' });
  ctx.sections.set('sec8a', { _id: 'sec8a', gradeId: 'g8', status: 'ACTIVE' });
  ctx.subjects.set('math', { _id: 'math', name: 'Mathematics', status: 'ACTIVE', type: 'CORE' });
  ctx.classSubjects.set('g8|math', { gradeId: 'g8', subjectId: 'math', weeklyPeriods: 6 });
  ctx.staffById.set('john', { _id: 'john', status: 'ACTIVE', firstName: 'John', lastName: 'Smith', unavailability: [] });
  ctx.teacherAssignments.set('sec8a|math|john', { sectionId: 'sec8a', subjectId: 'math', staffId: 'john' });

  // Simulate what buildFullContext + buildRequirementVariables would do for a
  // school with an existing LOCKED Math slot on Monday P1: it occupies the
  // context (place), and the requirement count is reduced by 1 (6 -> 5) —
  // exactly mirroring the real lockedCountBySectionSubject subtraction.
  ctx.place({ sectionId: 'sec8a', dayOfWeek: 'MONDAY', periodId: 'p1', subjectId: 'math', teacherId: 'john' });
  const variables = Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, sectionId: 'sec8a', sectionName: '8A', gradeId: 'g8', subjectId: 'math', subjectName: 'Mathematics', teacherId: 'john', isDouble: false, weeklyPeriods: 6 }));
  const { singles, doubles } = buildSlotDomain(DAYS, ps);
  const result = runGeneration({ variables, singles, doubles, ctx, academicYearId: 'ay1', constraints: { maxConsecutivePerSubject: 2, minGapPeriods: 0, distributionWeight: 5, preferredPeriodsWeight: 3 }, requestSeed: 'locked-slot-test' });

  test('the 5 remaining periods are placed (locked one already covers the 6th)', () => assert.strictEqual(result.stats.placed, 5));
  test('nothing new is ever placed at the locked slot\'s own position', () => {
    assert.ok(!result.slots.some((s) => s.dayOfWeek === 'MONDAY' && s.periodId === 'p1'), 'a new slot collided with the locked Monday P1 slot');
  });
  test('combined (locked + newly generated) totals exactly the weekly requirement', () => {
    const total = result.slots.length + 1; // +1 for the pre-existing locked slot
    assert.strictEqual(total, 6);
  });
})();

// --- Scenario 4: swap validation — both resulting positions must be valid, or neither swaps ---
(function swapValidation() {
  console.log('\nScenario: swap requires BOTH resulting positions to be valid (mirrors TimetableBulkService.swap)');
  const ps = periods(4);
  const ctx = new TimetableWorkingContext({ schoolId: 's1', academicYearId: 'ay1' });
  ps.forEach((p) => ctx.periods.set(p._id, p));
  ctx.grades.set('g8', { _id: 'g8', status: 'ACTIVE' });
  ctx.sections.set('sec8a', { _id: 'sec8a', gradeId: 'g8', status: 'ACTIVE' });
  ['math', 'sci'].forEach((id) => ctx.subjects.set(id, { _id: id, status: 'ACTIVE', type: 'CORE' }));
  ctx.classSubjects.set('g8|math', { gradeId: 'g8', subjectId: 'math' });
  ctx.classSubjects.set('g8|sci', { gradeId: 'g8', subjectId: 'sci' });
  ctx.staffById.set('john', { _id: 'john', status: 'ACTIVE', unavailability: [{ dayOfWeek: 'THURSDAY', periods: [] }] });
  ctx.staffById.set('david', { _id: 'david', status: 'ACTIVE', unavailability: [] });
  ctx.teacherAssignments.set('sec8a|math|john', { sectionId: 'sec8a', subjectId: 'math', staffId: 'john' });
  ctx.teacherAssignments.set('sec8a|sci|david', { sectionId: 'sec8a', subjectId: 'sci', staffId: 'david' });

  // A: Math/John on Monday P1. B: Science/David on Tuesday P2. Swapping their
  // (day,period) would put Math/John on Tuesday P2 (fine) and Science/David
  // on Monday P1 (fine) — a valid swap.
  ctx.place({ sectionId: 'sec8a', dayOfWeek: 'MONDAY', periodId: 'p1', subjectId: 'math', teacherId: 'john' });
  ctx.place({ sectionId: 'sec8a', dayOfWeek: 'TUESDAY', periodId: 'p2', subjectId: 'sci', teacherId: 'david' });
  // Mirror TimetableBulkService.applyBulkUpdate: free both current positions first.
  ctx.remove({ sectionId: 'sec8a', dayOfWeek: 'MONDAY', periodId: 'p1', subjectId: 'math', teacherId: 'john' });
  ctx.remove({ sectionId: 'sec8a', dayOfWeek: 'TUESDAY', periodId: 'p2', subjectId: 'sci', teacherId: 'david' });

  const { TimetableValidatorService } = require('../services/timetableValidatorService');
  const aToB = TimetableValidatorService.validateSlot({ academicYearId: 'ay1', gradeId: 'g8', sectionId: 'sec8a', dayOfWeek: 'TUESDAY', periodId: 'p2', subjectId: 'math', teacherId: 'john' }, ctx, { hardOnly: true });
  test('valid swap: Math/John into Tuesday P2 is accepted (John is free then)', () => assert.strictEqual(aToB.valid, true));

  // Now try swapping Math/John onto a day he's flagged unavailable (Thursday)
  // — must be rejected even mid-swap, regardless of the other slot being free.
  const badSwap = TimetableValidatorService.validateSlot({ academicYearId: 'ay1', gradeId: 'g8', sectionId: 'sec8a', dayOfWeek: 'THURSDAY', periodId: 'p1', subjectId: 'math', teacherId: 'john' }, ctx, { hardOnly: true });
  test('invalid swap destination (teacher unavailable that day) is rejected', () => assert.strictEqual(badSwap.valid, false));
})();

console.log(`\n${passed} check(s) passed.${process.exitCode ? ' Some checks FAILED — see above.' : ''}`);
