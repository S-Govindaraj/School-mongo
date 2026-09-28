const Staff = require('../models/Staff');
const Section = require('../models/Section');
const TeacherAssignment = require('../models/TeacherAssignment');
const { ForbiddenError } = require('../utils/errors');

/**
 * Resolves what sections a request is allowed to see/mark/correct attendance
 * for, per CLASS_ATTENDANCE_TAB_ARCHITECTURE.md.
 *
 * - `attendance_view_all` (wildcard-equivalent, granted to
 *   PRINCIPAL/VICE_PRINCIPAL/SUPER_ADMIN by the seed) → { mode: 'ALL' }.
 * - Everyone else is resolved to their homeroom section(s), mirroring the
 *   staff-resolution pattern already used by portalTeacherController.js
 *   (lines ~40-105) for the teacher-portal dashboard's "my classes" card.
 */
async function resolveAttendanceScope(req) {
  const schoolId = req.schoolContext?.schoolId;
  const rolePermissions = req.user?.roleId?.permissions || [];

  if (rolePermissions.includes('*') || rolePermissions.includes('attendance_view_all')) {
    return { mode: 'ALL' };
  }

  const staff = await Staff.findOne({
    schoolId,
    $or: [
      ...(req.user?._id ? [{ userId: req.user._id }] : []),
      ...(req.user?.email ? [{ email: req.user.email }] : []),
    ],
  }).lean();

  if (!staff) {
    return { mode: 'MINE', sectionIds: [], sections: [] };
  }

  // Primary source of truth: Section.classTeacherId (the same field
  // portalTeacherController.js already reads for the homeroom dashboard card).
  const homerooms = await Section.find({
    schoolId,
    classTeacherId: staff._id,
    status: { $ne: 'ARCHIVED' },
  })
    .populate('gradeId', 'name code')
    .select('_id name code gradeId')
    .lean();

  // Secondary source: TeacherAssignment.isClassTeacher — covers schools that
  // record class-teacher status per academic year / co-class-teacher setups
  // instead of (or in addition to) the single Section.classTeacherId field.
  const assignedHomerooms = await TeacherAssignment.find({
    schoolId,
    staffId: staff._id,
    isClassTeacher: true,
    status: 'ACTIVE',
  })
    .populate('sectionId', 'name code gradeId')
    .populate('gradeId', 'name code')
    .select('sectionId gradeId')
    .lean();

  const sectionMap = new Map();
  for (const s of homerooms) {
    sectionMap.set(String(s._id), {
      _id: s._id,
      name: s.name,
      code: s.code,
      gradeId: s.gradeId?._id || s.gradeId,
      gradeName: s.gradeId?.name || null,
    });
  }
  for (const a of assignedHomerooms) {
    const sec = a.sectionId;
    if (!sec) continue;
    const id = String(sec._id || sec);
    if (!sectionMap.has(id)) {
      sectionMap.set(id, {
        _id: sec._id || sec,
        name: sec.name,
        code: sec.code,
        gradeId: a.gradeId?._id || a.gradeId,
        gradeName: a.gradeId?.name || null,
      });
    }
  }

  const sections = [...sectionMap.values()];

  return {
    mode: 'MINE',
    sectionIds: sections.map((s) => String(s._id)),
    sections,
    staffId: staff._id,
  };
}

/**
 * Throws ForbiddenError unless `scope` allows access to `sectionId`.
 * Call this before any attendance WRITE (create session, mark-bulk, correct)
 * so a class teacher can never write outside their homeroom section(s), even
 * if the request is crafted directly (Postman, a compromised client, etc.).
 */
function assertSectionInScope(scope, sectionId) {
  if (!scope || scope.mode === 'ALL') return;

  const allowed = scope.sectionIds || [];
  if (!sectionId || !allowed.includes(String(sectionId))) {
    throw new ForbiddenError('You are not the class teacher for this section.');
  }
}

/**
 * Narrows a Mongoose filter object in place to the caller's scope. Use for
 * READ endpoints (list sessions/records/summaries) so a class teacher simply
 * never sees another section's data — no error, just a narrower result set.
 *
 * If the caller already passed an explicit single `sectionId` (e.g. a
 * multi-homeroom teacher's section switcher), it's kept as-is when it falls
 * within scope, so scoping never blocks a legitimate narrower query — and
 * forced to a no-match sentinel (rather than silently widened back out to
 * every allowed section) when it doesn't.
 */
function applyScopeToFilter(filter, scope) {
  if (!scope || scope.mode === 'ALL') return filter;

  const allowed = scope.sectionIds || [];

  if (filter.sectionId && typeof filter.sectionId === 'string') {
    filter.sectionId = allowed.includes(String(filter.sectionId)) ? filter.sectionId : '000000000000000000000000';
    return filter;
  }

  filter.sectionId = { $in: allowed };
  return filter;
}

module.exports = { resolveAttendanceScope, assertSectionInScope, applyScopeToFilter };
