// Lightweight, framework-free regression checks for TimetableValidatorService
// (src/services/timetableValidatorService.js) — the single shared conflict
// engine reused by manual create/update, the Smart Generator, bulk-update,
// and swap. Runs with no database. Extend as new constraint types are added;
// migrate to a real test runner once one is added to this backend.
//
// Run: node src/scripts/testTimetableValidator.js
const assert = require('assert');
const { TimetableValidatorService, TimetableWorkingContext } = require('../services/timetableValidatorService');

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

const baseCtx = () => {
  const ctx = new TimetableWorkingContext({ schoolId: 's1', academicYearId: 'ay1' });
  ctx.periods.set('p1', { _id: 'p1', sequence: 1, isBreak: false });
  ctx.periods.set('p2', { _id: 'p2', sequence: 2, isBreak: false });
  ctx.periods.set('p3', { _id: 'p3', sequence: 3, isBreak: false });
  ctx.periods.set('brk', { _id: 'brk', sequence: 4, isBreak: true });
  ctx.grades.set('g8', { _id: 'g8', status: 'ACTIVE' });
  ctx.sections.set('sec8a', { _id: 'sec8a', gradeId: 'g8', status: 'ACTIVE' });
  ctx.subjects.set('math', { _id: 'math', name: 'Mathematics', status: 'ACTIVE', type: 'CORE' });
  ctx.subjects.set('chem', { _id: 'chem', name: 'Chemistry', status: 'ACTIVE', type: 'LAB' });
  ctx.classSubjects.set('g8|math', { gradeId: 'g8', subjectId: 'math' });
  ctx.classSubjects.set('g8|chem', { gradeId: 'g8', subjectId: 'chem' });
  ctx.staffById.set('john', { _id: 'john', status: 'ACTIVE', firstName: 'John', lastName: 'Smith', unavailability: [] });
  ctx.staffById.set('mary', { _id: 'mary', status: 'ACTIVE', firstName: 'Mary', lastName: 'Lee', unavailability: [] });
  ctx.teacherAssignments.set('sec8a|math|john', { sectionId: 'sec8a', subjectId: 'math', staffId: 'john' });
  ctx.teacherAssignments.set('sec8a|chem|mary', { sectionId: 'sec8a', subjectId: 'chem', staffId: 'mary' });
  return ctx;
};

const slot = (over = {}) => ({
  academicYearId: 'ay1', gradeId: 'g8', sectionId: 'sec8a', dayOfWeek: 'MONDAY',
  periodId: 'p1', subjectId: 'math', teacherId: 'john', ...over,
});

// --- Entity/relationship validity ------------------------------------------
test('rejects a section that does not belong to the given grade', () => {
  const ctx = baseCtx();
  ctx.sections.set('secX', { _id: 'secX', gradeId: 'g9', status: 'ACTIVE' });
  const { valid, conflicts } = TimetableValidatorService.validateSlot(slot({ sectionId: 'secX' }), ctx, { hardOnly: true });
  assert.strictEqual(valid, false);
  assert.ok(conflicts.some((c) => c.type === 'INVALID_SECTION'));
});

test('rejects an archived section', () => {
  const ctx = baseCtx();
  ctx.sections.set('sec8a', { _id: 'sec8a', gradeId: 'g8', status: 'ARCHIVED' });
  const { valid, conflicts } = TimetableValidatorService.validateSlot(slot(), ctx, { hardOnly: true });
  assert.strictEqual(valid, false);
  assert.ok(conflicts.some((c) => c.type === 'INVALID_SECTION'));
});

test('rejects a break period', () => {
  const ctx = baseCtx();
  const { valid, conflicts } = TimetableValidatorService.validateSlot(slot({ periodId: 'brk' }), ctx, { hardOnly: true });
  assert.strictEqual(valid, false);
  assert.ok(conflicts.some((c) => c.type === 'PERIOD_UNAVAILABLE'));
});

test('rejects a subject not configured for the grade (SUBJECT_NOT_CONFIGURED)', () => {
  const ctx = baseCtx();
  const { valid, conflicts } = TimetableValidatorService.validateSlot(slot({ subjectId: 'unconfigured-subject' }), ctx, { hardOnly: true });
  assert.strictEqual(valid, false);
  assert.ok(conflicts.some((c) => c.type === 'SUBJECT_NOT_CONFIGURED'));
});

test('rejects a teacher not assigned to that subject/section (TEACHER_NOT_ASSIGNED)', () => {
  const ctx = baseCtx();
  const { valid, conflicts } = TimetableValidatorService.validateSlot(slot({ teacherId: 'mary' }), ctx, { hardOnly: true }); // mary teaches chem, not math
  assert.strictEqual(valid, false);
  assert.ok(conflicts.some((c) => c.type === 'TEACHER_NOT_ASSIGNED'));
});

test('accepts a fully valid, non-conflicting slot', () => {
  const ctx = baseCtx();
  const { valid } = TimetableValidatorService.validateSlot(slot(), ctx, { hardOnly: true });
  assert.strictEqual(valid, true);
});

// --- Room / lab conflicts ---------------------------------------------------
test('ROOM_CONFLICT: two sections cannot share a plain room at the same day/period', () => {
  const ctx = baseCtx();
  ctx.rooms.set('room1', { _id: 'room1', name: 'Room 101', isLab: false });
  ctx.place(slot({ roomId: 'room1' }));
  const { valid, conflicts } = TimetableValidatorService.validateSlot(
    slot({ subjectId: 'chem', teacherId: 'mary', roomId: 'room1' }), ctx, { hardOnly: true }
  );
  assert.strictEqual(valid, false);
  assert.ok(conflicts.some((c) => c.type === 'ROOM_CONFLICT'));
});

test('LAB_CONFLICT: a lab room double-booked reports LAB_CONFLICT, not a generic ROOM_CONFLICT', () => {
  const ctx = baseCtx();
  ctx.rooms.set('lab1', { _id: 'lab1', name: 'Chem Lab', isLab: true });
  ctx.place(slot({ subjectId: 'chem', teacherId: 'mary', roomId: 'lab1' }));
  const { valid, conflicts } = TimetableValidatorService.validateSlot(
    slot({ periodId: 'p1', roomId: 'lab1' }), ctx, { hardOnly: true }
  );
  assert.strictEqual(valid, false);
  assert.ok(conflicts.some((c) => c.type === 'LAB_CONFLICT'), `expected LAB_CONFLICT, got ${JSON.stringify(conflicts)}`);
});

test('different rooms at the same day/period never conflict', () => {
  const ctx = baseCtx();
  ctx.sections.set('sec8b', { _id: 'sec8b', gradeId: 'g8', status: 'ACTIVE' });
  ctx.teacherAssignments.set('sec8b|chem|mary', { sectionId: 'sec8b', subjectId: 'chem', staffId: 'mary' });
  ctx.rooms.set('room1', { _id: 'room1', name: 'Room 101', isLab: false });
  ctx.rooms.set('room2', { _id: 'room2', name: 'Room 102', isLab: false });
  ctx.place(slot({ roomId: 'room1' })); // sec8a, math/john, Monday P1, room1
  // A different section, different subject/teacher, SAME day/period, but a
  // different room — must not conflict on section, teacher, or room grounds.
  const { valid, conflicts } = TimetableValidatorService.validateSlot(
    slot({ sectionId: 'sec8b', subjectId: 'chem', teacherId: 'mary', roomId: 'room2' }), ctx, { hardOnly: true }
  );
  assert.strictEqual(valid, true, `expected valid, got conflicts: ${JSON.stringify(conflicts)}`);
});

// --- Soft constraints: daily limit, consecutive limit, minimum gap --------
test('SUBJECT_DAILY_LIMIT is a SOFT warning, not a hard block', () => {
  const ctx = baseCtx();
  ctx.place(slot({ periodId: 'p1' }));
  const { valid, conflicts } = TimetableValidatorService.validateSlot(
    slot({ periodId: 'p2' }), ctx, { hardOnly: false, constraints: { maxPeriodsPerDay: 1 } }
  );
  assert.strictEqual(valid, true, 'soft conflicts must not fail validity');
  assert.ok(conflicts.some((c) => c.type === 'SUBJECT_DAILY_LIMIT' && c.severity === 'SOFT'));
});

test('hardOnly:true ignores SUBJECT_DAILY_LIMIT entirely', () => {
  const ctx = baseCtx();
  ctx.place(slot({ periodId: 'p1' }));
  const { conflicts } = TimetableValidatorService.validateSlot(
    slot({ periodId: 'p2' }), ctx, { hardOnly: true, constraints: { maxPeriodsPerDay: 1 } }
  );
  assert.ok(!conflicts.some((c) => c.type === 'SUBJECT_DAILY_LIMIT'));
});

test('SUBJECT_CONSECUTIVE_LIMIT flags exceeding the configured run length', () => {
  const ctx = baseCtx();
  ctx.place(slot({ periodId: 'p1' }));
  ctx.place(slot({ periodId: 'p2' }));
  const { conflicts } = TimetableValidatorService.validateSlot(
    slot({ periodId: 'p3' }), ctx, { hardOnly: false, constraints: { maxConsecutivePerSubject: 2 } }
  );
  assert.ok(conflicts.some((c) => c.type === 'SUBJECT_CONSECUTIVE_LIMIT'), `expected SUBJECT_CONSECUTIVE_LIMIT, got ${JSON.stringify(conflicts)}`);
});

test('two consecutive periods within the allowed max raises no consecutive warning', () => {
  const ctx = baseCtx();
  ctx.place(slot({ periodId: 'p1' }));
  const { conflicts } = TimetableValidatorService.validateSlot(
    slot({ periodId: 'p2' }), ctx, { hardOnly: false, constraints: { maxConsecutivePerSubject: 2 } }
  );
  assert.ok(!conflicts.some((c) => c.type === 'SUBJECT_CONSECUTIVE_LIMIT'));
});

test('SUBJECT_GAP_VIOLATION flags placing the same subject too soon again', () => {
  const ctx = baseCtx();
  ctx.place(slot({ periodId: 'p1' }));
  const { conflicts } = TimetableValidatorService.validateSlot(
    slot({ periodId: 'p2' }), ctx, { hardOnly: false, constraints: { minGapPeriods: 3 } }
  );
  assert.ok(conflicts.some((c) => c.type === 'SUBJECT_GAP_VIOLATION'), `expected SUBJECT_GAP_VIOLATION, got ${JSON.stringify(conflicts)}`);
});

// --- Locked slots (validated indirectly here; the generator's own use of
// lockedCountBySectionSubject is covered in testTimetableGenerator.js) -----
test('a locked existing slot still participates in normal conflict detection', () => {
  const ctx = baseCtx();
  ctx.place({ ...slot(), isLocked: true }); // place() doesn't special-case isLocked — it's just occupancy
  const { valid, conflicts } = TimetableValidatorService.validateSlot(slot({ teacherId: 'john' }), ctx, { hardOnly: true });
  assert.strictEqual(valid, false);
  assert.ok(conflicts.some((c) => c.type === 'SECTION_CONFLICT' || c.type === 'TEACHER_CONFLICT'));
});

// --- excludeTimetableId (editing a slot shouldn't conflict with itself) ---
test('excludeTimetableId lets an entry validate against its own unchanged position', () => {
  const ctx = baseCtx();
  ctx.place({ ...slot(), _id: 'tt1' });
  const { valid } = TimetableValidatorService.validateSlot(
    { ...slot(), excludeTimetableId: 'tt1' }, ctx, { hardOnly: true }
  );
  assert.strictEqual(valid, true);
});

test('excludeTimetableId does NOT excuse a conflict with a DIFFERENT existing entry', () => {
  const ctx = baseCtx();
  ctx.place({ ...slot(), _id: 'tt1' });
  const { valid, conflicts } = TimetableValidatorService.validateSlot(
    { ...slot(), teacherId: 'john', excludeTimetableId: 'some-other-id' }, ctx, { hardOnly: true }
  );
  assert.strictEqual(valid, false);
  assert.ok(conflicts.some((c) => c.type === 'SECTION_CONFLICT'));
});

console.log(`\n${passed} check(s) passed.${process.exitCode ? ' Some checks FAILED — see above.' : ''}`);
