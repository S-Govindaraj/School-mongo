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
    const user = await User.findById(decoded.userId).populate('roleId');

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
  requirePermissions,
  getJwtSecret,
};
