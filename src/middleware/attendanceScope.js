const { resolveAttendanceScope } = require('../services/attendanceScopeService');

/**
 * Attaches `req.attendanceScope` ({mode:'ALL'} or {mode:'MINE', sectionIds,
 * sections, staffId}) to every attendance request. Must run after
 * `authenticate` (needs req.user/req.schoolContext). See
 * CLASS_ATTENDANCE_TAB_ARCHITECTURE.md §3.1-3.3.
 */
module.exports = async function attachAttendanceScope(req, res, next) {
  try {
    req.attendanceScope = await resolveAttendanceScope(req);
    next();
  } catch (err) {
    next(err);
  }
};
