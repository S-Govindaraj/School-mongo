const { resolveStaffAccessScope } = require('../services/staffAccessScopeService');

/**
 * Attaches `req.staffAccessScope` ({mode:'ALL'|'GRADE'|'SECTION', gradeIds,
 * sectionIds, staffId}) to every Students/Staff/Guardians request — Staff
 * In-Charge access control. Must run after `authenticate` (needs
 * req.user/req.schoolContext).
 */
module.exports = async function attachStaffAccessScope(req, res, next) {
  try {
    req.staffAccessScope = await resolveStaffAccessScope(req);
    next();
  } catch (err) {
    next(err);
  }
};
