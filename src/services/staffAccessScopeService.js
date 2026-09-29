const Staff = require('../models/Staff');
const Section = require('../models/Section');
const TeacherAssignment = require('../models/TeacherAssignment');
const Enrollment = require('../models/Enrollment');
const StudentGuardian = require('../models/StudentGuardian');

const NO_MATCH_ID = '000000000000000000000000';

/**
 * Resolves what the logged-in user is allowed to see across the Students,
 * Staff & Teachers, and Parents & Guardians modules — "Staff In-Charge"
 * access control.
 *
 * Deliberately a SEPARATE service from attendanceScopeService.js rather than
 * a shared core: that resolver defaults an unmatched/unscoped staff member to
 * "sees nothing" (mode: 'MINE', sectionIds: []), which is correct for
 * attendance's closed-by-default model but wrong here — this feature's
 * "other users" tier must default OPEN (mode: 'ALL', i.e. today's existing,
 * unrestricted behavior for any role that isn't specifically In-Charge or a
 * Class Teacher). Sharing one resolver between an open-by-default and a
 * closed-by-default consumer is exactly how the "empty gradeIds must not
 * grant full access" requirement would get silently inverted.
 *
 * Priority cascade (this IS the access-priority order):
 *   1. '*' permission or role.hierarchyLevel <= 1  -> mode: 'ALL' (Admin / Hierarchy Level 1)
 *   2. Staff.isIncharge === true                   -> mode: 'GRADE' (gradeIds, possibly [])
 *   3. Staff is a class teacher (homeroom section) -> mode: 'SECTION'
 *   4. Anything else                               -> mode: 'ALL' (today's existing, open behavior)
 *
 * Step 2 is taken unconditionally whenever isIncharge is true, even with an
 * empty gradeIds array — every downstream query then becomes `{ $in: [] }`,
 * i.e. zero rows, never "no filter." This makes the "in-charge with no
 * assigned grades sees nothing" requirement structural rather than a
 * special case that could be forgotten.
 *
 * @returns {Promise<{mode:'ALL'|'GRADE'|'SECTION', gradeIds:string[], sectionIds:string[], staffId:string|null}>}
 */
async function resolveStaffAccessScope(req) {
  const schoolId = req.schoolContext?.schoolId;
  const rolePermissions = req.user?.roleId?.permissions || [];
  const hierarchyLevel = Number(req.user?.roleId?.hierarchyLevel);

  if (rolePermissions.includes('*') || (Number.isFinite(hierarchyLevel) && hierarchyLevel <= 1)) {
    return { mode: 'ALL', gradeIds: [], sectionIds: [], staffId: null };
  }

  const staff = await Staff.findOne({
    schoolId,
    $or: [
      ...(req.user?._id ? [{ userId: req.user._id }] : []),
      ...(req.user?.email ? [{ email: req.user.email }] : []),
    ],
  })
    .select('_id isIncharge inchargeDetails')
    .lean();

  if (!staff) {
    return { mode: 'ALL', gradeIds: [], sectionIds: [], staffId: null };
  }

  if (staff.isIncharge) {
    return {
      mode: 'GRADE',
      gradeIds: (staff.inchargeDetails?.gradeIds || []).map(String),
      sectionIds: [],
      staffId: String(staff._id),
    };
  }

  // Primary source of truth: Section.classTeacherId (same field
  // attendanceScopeService.js / portalTeacherController.js already read).
  const homerooms = await Section.find({
    schoolId,
    classTeacherId: staff._id,
    status: { $ne: 'ARCHIVED' },
  })
    .select('_id')
    .lean();

  // Secondary/legacy source: TeacherAssignment.isClassTeacher.
  const assignedHomerooms = await TeacherAssignment.find({
    schoolId,
    staffId: staff._id,
    isClassTeacher: true,
    status: 'ACTIVE',
  })
    .select('sectionId')
    .lean();

  const sectionIdSet = new Set();
  for (const s of homerooms) sectionIdSet.add(String(s._id));
  for (const a of assignedHomerooms) {
    if (a.sectionId) sectionIdSet.add(String(a.sectionId));
  }

  if (sectionIdSet.size > 0) {
    return {
      mode: 'SECTION',
      gradeIds: [],
      sectionIds: [...sectionIdSet],
      staffId: String(staff._id),
    };
  }

  // Staff exists but is neither In-Charge nor a class teacher — "other
  // users, keep existing behavior" tier. Deliberately open, not restrictive.
  return { mode: 'ALL', gradeIds: [], sectionIds: [], staffId: String(staff._id) };
}

/**
 * Mutates an Enrollment-shaped filter ({schoolId, isCurrent, gradeId?,
 * sectionId?, academicYearId?, ...}) in place to respect `scope`. No-op for
 * mode 'ALL'. A caller-supplied gradeId/sectionId that falls outside scope is
 * forced to a non-matching sentinel rather than silently widened back out —
 * scoping must never be escaped by a query/URL parameter.
 */
function narrowEnrollmentFilter(filter, scope) {
  if (!scope || scope.mode === 'ALL') return filter;

  if (scope.mode === 'GRADE') {
    const allowed = scope.gradeIds || [];
    if (filter.gradeId && typeof filter.gradeId === 'string') {
      filter.gradeId = allowed.includes(String(filter.gradeId)) ? filter.gradeId : NO_MATCH_ID;
    } else {
      filter.gradeId = { $in: allowed };
    }
    return filter;
  }

  if (scope.mode === 'SECTION') {
    const allowed = scope.sectionIds || [];
    if (filter.sectionId && typeof filter.sectionId === 'string') {
      filter.sectionId = allowed.includes(String(filter.sectionId)) ? filter.sectionId : NO_MATCH_ID;
    } else {
      filter.sectionId = { $in: allowed };
    }
    return filter;
  }

  return filter;
}

/**
 * @returns {Promise<string[]|null>} null = no restriction (mode ALL); else
 * the (possibly empty) list of studentIds the caller is scoped to.
 */
async function resolveScopedStudentIds(scope, schoolId) {
  if (!scope || scope.mode === 'ALL') return null;

  const filter = { schoolId, isCurrent: true };
  if (scope.mode === 'GRADE') filter.gradeId = { $in: scope.gradeIds || [] };
  else if (scope.mode === 'SECTION') filter.sectionId = { $in: scope.sectionIds || [] };
  else return [];

  const ids = await Enrollment.distinct('studentId', filter);
  return ids.map(String);
}

/**
 * @returns {Promise<string[]|null>} null = no restriction; else the (possibly
 * empty) list of staffIds "associated with" the scoped grades/section —
 * teachers assigned to a subject/section/class within scope, plus the
 * section(s)' class teacher.
 */
async function resolveScopedStaffIds(scope, schoolId) {
  if (!scope || scope.mode === 'ALL') return null;

  if (scope.mode === 'GRADE') {
    const gradeIds = scope.gradeIds || [];
    if (gradeIds.length === 0) return [];

    const [gradeAssignmentStaffIds, sectionsInGrade, assignedGradeStaffIds] = await Promise.all([
      TeacherAssignment.distinct('staffId', { schoolId, gradeId: { $in: gradeIds }, status: 'ACTIVE' }),
      Section.find({ schoolId, gradeId: { $in: gradeIds }, status: { $ne: 'ARCHIVED' } })
        .select('_id classTeacherId')
        .lean(),
      // Teacher Assigned Grades — a direct, always-reliable field on Staff
      // (set from the staff form) that doesn't depend on TeacherAssignment/
      // timetable data existing at all.
      Staff.distinct('_id', { schoolId, assignedGradeIds: { $in: gradeIds } }),
    ]);

    const sectionIds = sectionsInGrade.map((s) => s._id);
    const sectionAssignmentStaffIds = sectionIds.length
      ? await TeacherAssignment.distinct('staffId', { schoolId, sectionId: { $in: sectionIds }, status: 'ACTIVE' })
      : [];
    const classTeacherIds = sectionsInGrade.map((s) => s.classTeacherId).filter(Boolean);

    const allowed = new Set(
      [...gradeAssignmentStaffIds, ...sectionAssignmentStaffIds, ...classTeacherIds, ...assignedGradeStaffIds].map(String)
    );
    return [...allowed];
  }

  if (scope.mode === 'SECTION') {
    const sectionIds = scope.sectionIds || [];
    const assignmentStaffIds = sectionIds.length
      ? await TeacherAssignment.distinct('staffId', { schoolId, sectionId: { $in: sectionIds }, status: 'ACTIVE' })
      : [];
    const allowed = new Set([...assignmentStaffIds].map(String));
    if (scope.staffId) allowed.add(String(scope.staffId));
    return [...allowed];
  }

  return [];
}

/**
 * @returns {Promise<string[]|null>} null = no restriction; else the (possibly
 * empty) list of guardianIds linked to a scoped student.
 */
async function resolveScopedGuardianIds(scope, schoolId) {
  if (!scope || scope.mode === 'ALL') return null;

  const studentIds = await resolveScopedStudentIds(scope, schoolId);
  if (studentIds === null) return null;
  if (studentIds.length === 0) return [];

  const guardianIds = await StudentGuardian.distinct('guardianId', { schoolId, studentId: { $in: studentIds } });
  return guardianIds.map(String);
}

function isGradeAllowed(scope, gradeId) {
  if (!scope || scope.mode === 'ALL') return true;
  if (scope.mode === 'GRADE') return (scope.gradeIds || []).includes(String(gradeId));
  return false;
}

function isSectionAllowed(scope, sectionId) {
  if (!scope || scope.mode === 'ALL') return true;
  if (scope.mode === 'SECTION') return (scope.sectionIds || []).includes(String(sectionId));
  return false;
}

/**
 * Detail-endpoint guard helper: given the scoped user's mode, checks a
 * student/guardian's current Enrollment doc (`{gradeId, sectionId}`, or
 * `null` if none exists) against scope. A GRADE-scoped user is checked by
 * gradeId, a SECTION-scoped user by sectionId; a missing enrollment (e.g. an
 * unplaced APPLICANT) is only visible to 'ALL'-mode users.
 */
function isEnrollmentAllowed(scope, enrollment) {
  if (!scope || scope.mode === 'ALL') return true;
  if (!enrollment) return false;
  if (scope.mode === 'GRADE') return isGradeAllowed(scope, enrollment.gradeId);
  if (scope.mode === 'SECTION') return isSectionAllowed(scope, enrollment.sectionId);
  return false;
}

module.exports = {
  resolveStaffAccessScope,
  narrowEnrollmentFilter,
  resolveScopedStudentIds,
  resolveScopedStaffIds,
  resolveScopedGuardianIds,
  isGradeAllowed,
  isSectionAllowed,
  isEnrollmentAllowed,
};
