const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
require('dotenv').config();

const Staff = require('../models/Staff');
const Section = require('../models/Section');
const Grade = require('../models/Grade');
const Enrollment = require('../models/Enrollment');
const {
  resolveStaffAccessScope,
  resolveScopedStudentIds,
  resolveScopedStaffIds,
  resolveScopedGuardianIds,
  narrowEnrollmentFilter,
} = require('../services/staffAccessScopeService');

// Exercises the Staff In-Charge / Class Teacher access-control scope
// resolver directly against real seed data (read-only — no writes/cleanup
// needed, same convention as testClassTeacherValidations.js). Builds fake
// `req` objects rather than hitting HTTP, since this repo has no test suite.
async function testValidations() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  const schoolId = '6aa92206207b18c94eb2d0ca';
  const fakeReq = (overrides = {}) => ({
    schoolContext: { schoolId },
    user: { _id: new mongoose.Types.ObjectId(), email: 'nonexistent-user@example.com', roleId: {} },
    ...overrides,
  });

  // --- Test 1: '*' permission bypass -> ALL -----------------------------
  console.log('\n--- Test 1: "*" permission bypass ---');
  {
    const req = fakeReq({ user: { roleId: { permissions: ['*'] } } });
    const scope = await resolveStaffAccessScope(req);
    if (scope.mode === 'ALL') console.log('✓ Passed: "*" permission resolves to mode ALL');
    else console.error(`✗ Failed: expected ALL, got ${scope.mode}`);
  }

  // --- Test 2: hierarchyLevel <= 1 bypass -> ALL -------------------------
  console.log('\n--- Test 2: hierarchyLevel <= 1 bypass ---');
  {
    const req = fakeReq({ user: { roleId: { permissions: [], hierarchyLevel: 1 } } });
    const scope = await resolveStaffAccessScope(req);
    if (scope.mode === 'ALL') console.log('✓ Passed: hierarchyLevel 1 resolves to mode ALL');
    else console.error(`✗ Failed: expected ALL, got ${scope.mode}`);
  }

  // --- Test 3: plain staff, not in-charge, not class teacher -> ALL -----
  // ("other users, keep existing behavior" — the regression check).
  console.log('\n--- Test 3: non-special staff falls through to ALL ---');
  {
    const plainStaff = await Staff.findOne({
      schoolId,
      isIncharge: { $ne: true },
      status: 'ACTIVE',
    }).lean();
    const homeroom = plainStaff
      ? await Section.findOne({ schoolId, classTeacherId: plainStaff._id, status: { $ne: 'ARCHIVED' } }).lean()
      : null;
    if (plainStaff && !homeroom) {
      const req = fakeReq({ user: { _id: plainStaff.userId, email: plainStaff.email, roleId: { permissions: [] } } });
      const scope = await resolveStaffAccessScope(req);
      if (scope.mode === 'ALL') console.log(`✓ Passed: staff ${plainStaff.firstName} (no in-charge, no homeroom) resolves to ALL`);
      else console.error(`✗ Failed: expected ALL, got ${scope.mode}`);
    } else {
      console.log('Note: no staff found without in-charge/homeroom assignment to test this case against — skipped.');
    }
  }

  // --- Test 4: In-Charge with one grade -----------------------------------
  console.log('\n--- Test 4: In-Charge with one assigned grade ---');
  {
    let inchargeStaff = await Staff.findOne({ schoolId, isIncharge: true, 'inchargeDetails.gradeIds.0': { $exists: true } }).lean();
    if (!inchargeStaff) {
      console.log('Note: no isIncharge staff with gradeIds found in seed data — skipped (run against a school with Staff In-Charge configured to exercise this).');
    } else {
      const gradeIds = inchargeStaff.inchargeDetails.gradeIds.map(String);
      const req = fakeReq({ user: { _id: inchargeStaff.userId, email: inchargeStaff.email, roleId: { permissions: [] } } });
      const scope = await resolveStaffAccessScope(req);
      if (scope.mode === 'GRADE' && gradeIds.every((g) => scope.gradeIds.includes(g))) {
        console.log(`✓ Passed: in-charge staff resolves to GRADE mode with gradeIds [${scope.gradeIds}]`);
      } else {
        console.error(`✗ Failed: expected GRADE mode with [${gradeIds}], got mode=${scope.mode} gradeIds=[${scope.gradeIds}]`);
      }

      const studentIds = await resolveScopedStudentIds(scope, schoolId);
      const outOfScopeCount = await Enrollment.countDocuments({
        schoolId,
        isCurrent: true,
        gradeId: { $nin: gradeIds },
        studentId: { $in: studentIds },
      });
      if (outOfScopeCount === 0) console.log(`✓ Passed: resolveScopedStudentIds returned only in-grade students (${studentIds.length} total)`);
      else console.error(`✗ Failed: ${outOfScopeCount} out-of-grade students leaked into the scoped student list`);
    }
  }

  // --- Test 5: In-Charge with empty gradeIds -> sees NOTHING, not ALL ----
  // The critical regression case: this must be `[]`, never `null`.
  console.log('\n--- Test 5: In-Charge with empty gradeIds must not grant full access ---');
  {
    const scope = { mode: 'GRADE', gradeIds: [], sectionIds: [], staffId: 'irrelevant' };
    const studentIds = await resolveScopedStudentIds(scope, schoolId);
    const staffIds = await resolveScopedStaffIds(scope, schoolId);
    const guardianIds = await resolveScopedGuardianIds(scope, schoolId);
    const allEmpty = [studentIds, staffIds, guardianIds].every((r) => Array.isArray(r) && r.length === 0);
    if (allEmpty) console.log('✓ Passed: empty gradeIds -> resolveScoped*Ids all return [] (not null / not all-records)');
    else console.error(`✗ Failed: expected all empty arrays, got students=${JSON.stringify(studentIds)} staff=${JSON.stringify(staffIds)} guardians=${JSON.stringify(guardianIds)}`);
  }

  // --- Test 6: Class Teacher scoping (and exclusion of a different section) ---
  console.log('\n--- Test 6: Class Teacher section scoping ---');
  {
    const homeroomSection = await Section.findOne({ schoolId, classTeacherId: { $ne: null }, status: { $ne: 'ARCHIVED' } })
      .populate('classTeacherId')
      .lean();
    const otherSection = homeroomSection
      ? await Section.findOne({ schoolId, _id: { $ne: homeroomSection._id }, status: { $ne: 'ARCHIVED' } }).lean()
      : null;

    if (homeroomSection?.classTeacherId && otherSection) {
      const teacher = homeroomSection.classTeacherId;
      const req = fakeReq({ user: { _id: teacher.userId, email: teacher.email, roleId: { permissions: [] } } });
      const scope = await resolveStaffAccessScope(req);
      const inScope = scope.mode === 'SECTION' && scope.sectionIds.includes(String(homeroomSection._id));
      const excludesOther = !scope.sectionIds.includes(String(otherSection._id));
      if (inScope && excludesOther) console.log(`✓ Passed: class teacher scoped to their own section (${homeroomSection.name}), excluding section ${otherSection.name}`);
      else console.error(`✗ Failed: mode=${scope.mode} sectionIds=[${scope.sectionIds}] — expected [${homeroomSection._id}] only`);
    } else {
      console.log('Note: need at least 2 sections with one having a class teacher — skipped.');
    }
  }

  // --- Test 7: query-param escape attempt is blocked ----------------------
  console.log('\n--- Test 7: caller-supplied out-of-scope gradeId cannot escape scope ---');
  {
    const grades = await Grade.find({ schoolId }).limit(2).lean();
    if (grades.length === 2) {
      const [gradeA, gradeB] = grades;
      const scope = { mode: 'GRADE', gradeIds: [String(gradeA._id)], sectionIds: [], staffId: 'irrelevant' };
      const filter = { schoolId, isCurrent: true, gradeId: String(gradeB._id) }; // caller tries to request a grade outside scope
      narrowEnrollmentFilter(filter, scope);
      const results = await Enrollment.find(filter).lean();
      if (results.length === 0) console.log('✓ Passed: requesting an out-of-scope gradeId via query params yields 0 results');
      else console.error(`✗ Failed: out-of-scope gradeId query returned ${results.length} results`);
    } else {
      console.log('Note: need at least 2 grades in seed data — skipped.');
    }
  }

  console.log('\nAll validation checks completed.');
  await mongoose.disconnect();
}

testValidations().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
