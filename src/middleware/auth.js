const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const { AuthenticationError, ForbiddenError } = require('../utils/errors');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is missing in production!');
    }
    return 'development_school_erp_secure_jwt_secret_key_2026';
  }
  return secret;
};

const authenticate = async (req, res, next) => {
  try {
    let token = req.cookies?.token;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new AuthenticationError('Authentication required. Token missing.');
    }

    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.userId)
      .select('name email phone status schoolId roleId')
      .populate('roleId', 'name code permissions')
      .lean();

    if (!user || user.status !== 'ACTIVE') {
      throw new AuthenticationError('User profile inactive or unauthenticated.');
    }

    req.user = user;
    req.schoolContext = {
      schoolId: user.schoolId?._id || user.schoolId,
    };
    next();
  } catch (error) {
    next(new AuthenticationError(error.message || 'Invalid authentication token.'));
  }
};

const optionalAuthenticate = async (req, res, next) => {
  try {
    let token = req.cookies?.token;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, getJwtSecret());
        const user = await User.findById(decoded.userId)
          .select('name email phone status schoolId roleId')
          .populate('roleId', 'name code permissions')
          .lean();
        if (user && user.status === 'ACTIVE') {
          req.user = user;
          req.schoolContext = {
            schoolId: user.schoolId?._id || user.schoolId,
          };
        }
      } catch (_) {
        // Ignore token errors for optional authentication
      }
    }
    next();
  } catch (error) {
    next();
  }
};

const PERMISSION_ALIASES = {
  // Primary Underscore Permissions mapped to legacy dot and action aliases
  'school_view': ['school.view', 'school_view'],
  'school_manage': ['school.manage', 'school_edit', 'school_view', 'school.view'],
  'campus_view': ['campus.view', 'campus_view'],
  'campus_manage': ['campus.manage', 'campus_create', 'campus_edit', 'campus_delete', 'campus_view', 'campus.view'],
  'academic_year_view': ['academic_year.view', 'academic_year_view'],
  'academic_year_manage': ['academic_year.manage', 'academic_year_manage', 'academic_year_view', 'academic_year.view'],
  'academic_term_view': ['academic_term.view', 'academic_term_view'],
  'academic_term_manage': ['academic_term.manage', 'academic_term_manage', 'academic_term_view', 'academic_term.view'],
  'grade_view': ['grade.view', 'grade_view'],
  'grade_manage': ['grade.manage', 'grade_manage', 'grade_view', 'grade.view'],
  'section_view': ['section.view', 'section_view'],
  'section_manage': ['section.manage', 'section_manage', 'section_view', 'section.view'],
  'subject_view': ['subject.view', 'subject_view'],
  'subject_manage': ['subject.manage', 'subject_manage', 'subject_view', 'subject.view'],
  'class_subject_view': ['class_subject.view', 'class_subject_view'],
  'class_subject_manage': ['class_subject.manage', 'class_subject_manage', 'class_subject_view', 'class_subject.view'],
  'staff_view': ['staff.view', 'teacher_view', 'staff_view'],
  'staff_manage': ['staff.manage', 'teacher_create', 'teacher_edit', 'teacher_delete', 'teacher_view', 'staff_view'],
  'teacher_assignment_view': ['teacher_assignment.view', 'teacher_assignment_view', 'teacher_assignment_manage'],
  'teacher_assignment_manage': ['teacher_assignment.manage', 'teacher_assignment_manage'],
  'settings_view': ['settings.view', 'settings_view'],
  'settings_manage': ['settings.manage', 'settings_manage', 'settings_view', 'settings.view'],
  'audit_view': ['audit.view', 'audit_view'],
  'role_view': ['role.view', 'role_view'],
  'role_manage': ['role.manage', 'role_create', 'role_edit', 'role_delete', 'role_activate', 'role_view', 'role.view'],
  'parent_portal_view': ['parent_portal_view', 'parent_portal.view', 'school_view', 'admin_view'],
  'teacher_portal_view': ['teacher_portal_view', 'teacher_portal.view', 'teacher_view', 'staff_view', 'school_view'],
  'student_portal_view': ['student_portal_view', 'student_portal.view', 'student_view', 'school_view'],

  // Smart Timetable Generator: these are new, more granular permissions split
  // out of the pre-existing 'timetable_manage'. Any role that already had
  // 'timetable_manage' before this feature existed keeps working immediately
  // without needing a manual role update — same backward-compatibility
  // pattern as every other resource above.
  'timetable_generate': ['timetable_generate', 'timetable_manage'],
  'timetable_publish': ['timetable_publish', 'timetable_manage'],
  'timetable_lock': ['timetable_lock', 'timetable_manage'],
  'room_view': ['room_view', 'room_manage', 'timetable_manage', 'period_manage'],
  'room_manage': ['room_manage', 'timetable_manage'],

  // Student 360: exam_result_view is a brand-new permission (ExamResult had no
  // API surface before this feature) — aliased to student_view so any role that
  // could already view a student's profile can see their exam results too,
  // without needing a manual role update.
  'exam_result_view': ['exam_result_view', 'student_view'],
};

const requirePermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roleId) {
      return next(new ForbiddenError('Access denied. No role assigned.'));
    }

    const userPermissions = req.user.roleId.permissions || [];

    // Bypass check ONLY if wildcard '*' is explicitly granted or unconfigured legacy
    if (userPermissions.includes('*')) {
      return next();
    }

    const hasPermission = requiredPermissions.every((perm) => {
      // Check direct code match
      if (userPermissions.includes(perm)) return true;
      // Check underscore conversion
      const underscorePerm = perm.replace(/\./g, '_');
      if (userPermissions.includes(underscorePerm)) return true;
      // Check alias list
      const aliases = PERMISSION_ALIASES[perm] || PERMISSION_ALIASES[underscorePerm] || [];
      return aliases.some((alias) => userPermissions.includes(alias));
    });

    if (!hasPermission) {
      return next(new ForbiddenError(`Required permission missing: ${requiredPermissions.join(', ')}`));
    }

    next();
  };
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  requirePermissions,
  getJwtSecret,
};
