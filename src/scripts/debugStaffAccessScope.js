/**
 * Diagnoses why a given staff member's Staff In-Charge / Class Teacher scope
 * isn't restricting what they see — read-only, makes no changes.
 *
 * Usage:
 *   node src/scripts/debugStaffAccessScope.js --employeeId=EMP-0090
 *   node src/scripts/debugStaffAccessScope.js --email=someone@school.internal
 */
const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
require('dotenv').config();

const Staff = require('../models/Staff');
const User = require('../models/User');
const Role = require('../models/Role');
const Grade = require('../models/Grade');
const {
  resolveStaffAccessScope,
  resolveScopedStudentIds,
  resolveScopedStaffIds,
  resolveScopedGuardianIds,
} = require('../services/staffAccessScopeService');

const arg = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : null;
};

async function run() {
  const employeeId = arg('employeeId');
  const email = arg('email');
  if (!employeeId && !email) {
    console.error('Usage: node src/scripts/debugStaffAccessScope.js --employeeId=EMP-0090  (or --email=...)');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB\n');

  const staffQuery = employeeId ? { employeeId: employeeId.trim() } : { email: email.trim() };
  const staff = await Staff.findOne(staffQuery).lean();

  if (!staff) {
    console.error(`✗ No Staff record found for ${JSON.stringify(staffQuery)}.`);
    await mongoose.disconnect();
    return;
  }

  console.log('--- Staff record ---');
  console.log(`Name: ${staff.firstName} ${staff.lastName}`);
  console.log(`employeeId: ${staff.employeeId}`);
  console.log(`email: ${staff.email}`);
  console.log(`userId: ${staff.userId}`);
  console.log(`status: ${staff.status}`);
  console.log(`isIncharge: ${staff.isIncharge}`);
  console.log(`inchargeDetails.gradeIds: ${JSON.stringify((staff.inchargeDetails?.gradeIds || []).map(String))}`);
  console.log(`assignedGradeIds: ${JSON.stringify((staff.assignedGradeIds || []).map(String))}`);

  if (staff.inchargeDetails?.gradeIds?.length) {
    const grades = await Grade.find({ _id: { $in: staff.inchargeDetails.gradeIds } }).select('name code').lean();
    console.log(`In-charge grades resolved: ${grades.map((g) => `${g.name} (${g._id})`).join(', ') || '(none matched — dangling gradeIds!)'}`);
  }

  const user = await User.findById(staff.userId).populate('roleId').lean();
  if (!user) {
    console.error(`\n✗ staff.userId (${staff.userId}) does NOT resolve to any User document. This staff member cannot log in under this userId at all — check for a duplicate/second Staff record, or a User created separately with a different _id.`);
    await mongoose.disconnect();
    return;
  }

  console.log('\n--- Linked User / Role ---');
  console.log(`User: ${user.name} <${user.email}> status=${user.status}`);
  console.log(`Role: ${user.roleId?.name} (code=${user.roleId?.code}) hierarchyLevel=${user.roleId?.hierarchyLevel} permissions=${JSON.stringify(user.roleId?.permissions)}`);

  if (String(user.email).toLowerCase() !== String(staff.email).toLowerCase()) {
    console.warn(`\n⚠ Staff.email (${staff.email}) and User.email (${user.email}) differ. resolveStaffAccessScope matches on userId OR email — as long as EITHER matches the logged-in session's req.user, resolution still works, but this mismatch is worth knowing about if the staff member logs in with a DIFFERENT email than either of these.`);
  }

  console.log('\n--- Resolving scope (exactly as a real request would) ---');
  const fakeReq = {
    schoolContext: { schoolId: staff.schoolId },
    user: { _id: user._id, email: user.email, roleId: user.roleId },
  };

  const perms = user.roleId?.permissions || [];
  const hLevel = Number(user.roleId?.hierarchyLevel);
  if (perms.includes('*')) console.log(`-> Role has '*' permission: this ALONE forces mode ALL, regardless of isIncharge.`);
  if (Number.isFinite(hLevel) && hLevel <= 1) console.log(`-> Role hierarchyLevel is ${hLevel} (<=1): this ALONE forces mode ALL, regardless of isIncharge.`);

  const scope = await resolveStaffAccessScope(fakeReq);
  console.log(`\nResolved scope: ${JSON.stringify(scope)}`);

  if (scope.mode === 'ALL') {
    if (perms.includes('*') || (Number.isFinite(hLevel) && hLevel <= 1)) {
      console.log('Reason: Admin/Hierarchy-Level-1 bypass (see above) — this user is intentionally unrestricted.');
    } else if (!staff.isIncharge) {
      console.log('Reason: staff.isIncharge is false (or was never saved) AND this staff is not a Section.classTeacherId / TeacherAssignment.isClassTeacher class teacher — falls through to the open "other users" tier.');
      console.log('Fix: set isIncharge=true (and inchargeDetails.gradeIds) via the Staff edit form, then re-run this script.');
    } else {
      console.log('Unexpected: isIncharge is true but scope resolved to ALL — investigate resolveStaffAccessScope directly.');
    }
  } else if (scope.mode === 'GRADE') {
    const [studentIds, staffIds, guardianIds] = await Promise.all([
      resolveScopedStudentIds(scope, staff.schoolId),
      resolveScopedStaffIds(scope, staff.schoolId),
      resolveScopedGuardianIds(scope, staff.schoolId),
    ]);
    console.log(`\nWith this scope, the Students/Staff/Guardians APIs would return:`);
    console.log(`  Students in scope:  ${studentIds.length}`);
    console.log(`  Staff in scope:     ${staffIds.length}`);
    console.log(`  Guardians in scope: ${guardianIds.length}`);
    if (scope.gradeIds.length === 0) {
      console.log('  (gradeIds is empty — this is CORRECT "sees nothing" behavior per the in-charge-with-no-grades rule, not a bug.)');
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
