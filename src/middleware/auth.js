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
      .populate('roleId', 'name code permissions hierarchyLevel')
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
          .populate('roleId', 'name code permissions hierarchyLevel')
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
  'school_edit': ['school_edit', 'school_manage', 'school.manage'],
  'campus_view': ['campus.view', 'campus_view'],
  'campus_manage': ['campus.manage', 'campus_create', 'campus_edit', 'campus_delete', 'campus_view', 'campus.view'],
  'academic_config_view': ['academic_config_view', 'academic_year_view', 'academic_term_view', 'grade_view', 'section_view', 'subject_view', 'class_subject_view', 'teacher_assignment_view', 'academic_year_manage', 'academic_setup'],
  'academic_year_view': ['academic_year.view', 'academic_year_view'],
  'academic_year_create': ['academic_year_create', 'academic_year_add', 'academic_year_manage'],
  'academic_year_import': ['academic_year_import'],
  'academic_year_edit': ['academic_year_edit', 'academic_year_manage'],
  'academic_year_active': ['academic_year_active', 'academic_year_activate', 'academic_year_manage'],
  'academic_year_inactive': ['academic_year_inactive', 'academic_year_deactivate', 'academic_year_manage'],
  'academic_year_manage': ['academic_year.manage', 'academic_year_manage', 'academic_year_view', 'academic_year.view'],
  'academic_term_view': ['academic_term.view', 'academic_term_view'],
  'academic_term_create': ['academic_term_create', 'academic_term_add', 'academic_term_manage', 'academic_year_manage'],
  'academic_term_import': ['academic_term_import'],
  'academic_term_edit': ['academic_term_edit', 'academic_term_manage', 'academic_year_manage'],
  'academic_term_active': ['academic_term_active', 'academic_term_activate', 'academic_term_manage', 'academic_year_manage'],
  'academic_term_inactive': ['academic_term_inactive', 'academic_term_deactivate', 'academic_term_manage', 'academic_year_manage'],
  'academic_term_manage': ['academic_term.manage', 'academic_term_manage', 'academic_term_view', 'academic_term.view'],
  'grade_view': ['grade.view', 'grade_view'],
  'grade_create': ['grade_create', 'grade_add', 'grade_manage'],
  'grade_import': ['grade_import'],
  'grade_edit': ['grade_edit', 'grade_manage'],
  'grade_active': ['grade_active', 'grade_activate', 'grade_manage'],
  'grade_inactive': ['grade_inactive', 'grade_deactivate', 'grade_manage'],
  'grade_manage': ['grade.manage', 'grade_manage', 'grade_view', 'grade.view'],
  'section_view': ['section.view', 'section_view'],
  'section_create': ['section_create', 'section_add', 'section_manage', 'grade_manage'],
  'section_import': ['section_import'],
  'section_edit': ['section_edit', 'section_manage', 'grade_manage'],
  'section_active': ['section_active', 'section_activate', 'section_manage', 'grade_manage'],
  'section_inactive': ['section_inactive', 'section_deactivate', 'section_manage', 'grade_manage'],
  'section_manage': ['section.manage', 'section_manage', 'section_view', 'section.view'],
  'subject_view': ['subject.view', 'subject_view'],
  'subject_create': ['subject_create', 'subject_add', 'subject_manage'],
  'subject_import': ['subject_import'],
  'subject_edit': ['subject_edit', 'subject_manage'],
  'subject_active': ['subject_active', 'subject_activate', 'subject_manage'],
  'subject_inactive': ['subject_inactive', 'subject_deactivate', 'subject_manage'],
  'subject_manage': ['subject.manage', 'subject_manage', 'subject_view', 'subject.view'],
  'class_subject_view': ['class_subject.view', 'class_subject_view'],
  'class_subject_edit': ['class_subject_edit', 'class_subject_manage'],
  'class_subject_manage': ['class_subject.manage', 'class_subject_manage', 'class_subject_view', 'class_subject.view'],
  'staff_view': ['staff.view', 'staff_view', 'teacher_view', 'staff_manage', 'teacher_manage'],
  'staff_create': ['staff_create', 'staff_add', 'staff_manage', 'teacher_create', 'teacher_manage'],
  'staff_import': ['staff_import'],
  'staff_edit': ['staff_edit', 'staff_update', 'staff_manage', 'teacher_edit', 'teacher_manage'],
  'staff_active': ['staff_active', 'staff_activate', 'staff_manage', 'teacher_active', 'teacher_delete', 'teacher_manage'],
  'staff_inactive': ['staff_inactive', 'staff_deactivate', 'staff_manage', 'teacher_inactive', 'teacher_delete', 'teacher_manage'],
  'staff_manage': ['staff.manage', 'staff_manage', 'staff_create', 'staff_edit', 'staff_active', 'staff_inactive', 'staff_view', 'staff.view', 'teacher_create', 'teacher_edit', 'teacher_delete', 'teacher_view'],
  'teacher_view': ['teacher_view', 'staff_view', 'staff_manage', 'teacher_manage'],
  'teacher_create': ['teacher_create', 'staff_create', 'staff_manage', 'teacher_manage'],
  'teacher_edit': ['teacher_edit', 'staff_edit', 'staff_manage', 'teacher_manage'],
  'teacher_delete': ['teacher_delete', 'staff_inactive', 'staff_active', 'staff_manage', 'teacher_manage'],
  'teacher_assignment_view': ['teacher_assignment.view', 'teacher_assignment_view', 'teacher_assignment_manage'],
  'teacher_assignment_create': ['teacher_assignment_create', 'teacher_assignment_add', 'teacher_assignment_manage', 'teacher_create'],
  'teacher_assignment_edit': ['teacher_assignment_edit', 'teacher_assignment_manage', 'teacher_edit'],
  'teacher_assignment_active': ['teacher_assignment_active', 'teacher_assignment_manage', 'teacher_delete'],
  'teacher_assignment_inactive': ['teacher_assignment_inactive', 'teacher_assignment_manage', 'teacher_delete'],
  'teacher_assignment_manage': ['teacher_assignment.manage', 'teacher_assignment_manage'],
  'guardian_view': ['guardian.view', 'guardian_view', 'guardian_manage', 'admin_manage', 'parent_view'],
  'guardian_create': ['guardian_create', 'guardian_manage', 'admin_manage'],
  'guardian_import': ['guardian_import'],
  'guardian_edit': ['guardian_edit', 'guardian_update', 'guardian_manage', 'admin_manage'],
  'guardian_update': ['guardian_update', 'guardian_edit', 'guardian_manage', 'admin_manage'],
  'guardian_active': ['guardian_active', 'guardian_update', 'guardian_manage', 'admin_manage'],
  'guardian_inactive': ['guardian_inactive', 'guardian_delete', 'guardian_update', 'guardian_manage', 'admin_manage'],
  'guardian_delete': ['guardian_delete', 'guardian_inactive', 'guardian_manage', 'admin_manage'],
  'guardian_manage': ['guardian.manage', 'guardian_manage', 'guardian_create', 'guardian_edit', 'guardian_update', 'guardian_active', 'guardian_inactive', 'guardian_view'],
  'document_view': ['document_view', 'document.view', 'student_view', 'document_manage', 'admin_manage'],
  'document_upload': ['document_upload', 'document_create', 'student_update', 'document_manage', 'admin_manage'],
  'document_create': ['document_create', 'document_upload', 'student_update', 'document_manage', 'admin_manage'],
  'document_edit': ['document_edit', 'document_update', 'student_update', 'document_manage', 'admin_manage'],
  'document_update': ['document_update', 'document_edit', 'student_update', 'document_manage', 'admin_manage'],
  'document_delete': ['document_delete', 'document_archive', 'student_archive', 'student_update', 'document_manage', 'admin_manage'],
  'document_archive': ['document_archive', 'document_delete', 'student_archive', 'student_update', 'document_manage', 'admin_manage'],
  'document_download': ['document_download', 'document_view', 'student_view', 'document_manage', 'admin_manage'],
  'document_manage': ['document_manage', 'admin_manage'],

  // Wave 2 (Students/Attendance/Guardians remediation, Sept 2026):
  // student_status_change is a newly-seeded catalog code for the (currently
  // dead — no frontend caller) PATCH /students/:id/status route; aliased to
  // the closely-related student_update/student_archive so it isn't a dead
  // end for any role if/when a caller is added.
  'student_active': ['student_active', 'student_status_change', 'student_archive', 'admin_manage'],
  'student_inactive': ['student_inactive', 'student_status_change', 'student_archive', 'admin_manage'],
  'student_status_change': ['student_status_change', 'student_active', 'student_inactive', 'student_archive', 'admin_manage'],
  'student_archive': ['student_archive', 'student_active', 'student_inactive', 'student_status_change', 'admin_manage'],
  'student_import': ['student_import'],
  // enrollment_promote is a newly-seeded catalog code for the per-enrollment
  // Promote route (fixed this wave to actually take an :id param). The
  // pre-existing enrollment_update code's own catalog description is
  // "Promote / Transfer Students", so any role already holding it for that
  // purpose keeps working immediately without a manual role update — same
  // backward-compatibility pattern used throughout this file.
  'enrollment_promote': ['enrollment_promote', 'enrollment_update'],
  'settings_view': ['settings.view', 'settings_view'],
  'settings_manage': ['settings.manage', 'settings_manage', 'settings_view', 'settings.view'],
  'audit_view': ['audit.view', 'audit_view'],
  'role_view': ['role.view', 'role_view'],
  'role_manage': ['role.manage', 'role_create', 'role_edit', 'role_delete', 'role_activate', 'role_view', 'role.view'],
  // Legacy granular Role codes (role_create/_edit/_delete) — the backend routes
  // themselves only ever check role_manage, but these aliases make the legacy
  // codes actually work as advertised by their seedDatabase.js "(Legacy) /
  // Alias for role_manage" descriptions, for any role still holding them.
  'role_create': ['role_create', 'role_manage'],
  'role_edit': ['role_edit', 'role_manage'],
  'role_delete': ['role_delete', 'role_manage'],
  'role_activate': ['role_activate', 'role_manage'],
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
  'timetable_create': ['timetable_create', 'timetable_manage'],
  'timetable_update': ['timetable_update', 'timetable_manage'],
  'timetable_delete': ['timetable_delete', 'timetable_manage'],
  'room_view': ['room_view', 'room_manage', 'timetable_manage', 'period_manage'],
  'room_manage': ['room_manage', 'timetable_manage'],

  // Periods/Rooms: granular create/edit/active/inactive split out of the
  // pre-existing coarse period_manage/room_manage codes. Any role that
  // already held the coarse code keeps working immediately without a
  // manual role update — same backward-compatibility pattern used
  // throughout this file (e.g. academic_year_manage above).
  'period_create': ['period_create', 'period_manage'],
  'period_edit': ['period_edit', 'period_manage'],
  'period_active': ['period_active', 'period_manage'],
  'period_inactive': ['period_inactive', 'period_manage'],
  'room_create': ['room_create', 'room_manage'],
  'room_edit': ['room_edit', 'room_manage'],
  'room_active': ['room_active', 'room_manage'],
  'room_inactive': ['room_inactive', 'room_manage'],

  // Student 360: exam_result_view is a brand-new permission (ExamResult had no
  // API surface before this feature) — aliased to student_view so any role that
  // could already view a student's profile can see their exam results too,
  // without needing a manual role update.
  'exam_result_view': ['exam_result_view', 'student_view'],

  // Examinations: new permissions for the exam creation/scheduling/marks-entry/
  // publishing pipeline. exam_view/exam_marks_enter/exam_result_calculate are
  // aliased to the broader exam_manage so an admin who can already manage exams
  // isn't blocked. exam_marks_verify/exam_result_publish/exam_lock are
  // deliberately given NO alias (explicit-grant-only), matching the
  // discipline_view/medical_view pattern for sensitive, student/parent-visible actions.
  'exam_view': ['exam_view', 'exam_manage'],
  'exam_manage': ['exam_manage'],
  'exam_marks_enter': ['exam_marks_enter', 'exam_manage'],
  'exam_marks_verify': ['exam_marks_verify'],
  'exam_result_calculate': ['exam_result_calculate', 'exam_manage'],
  'exam_result_publish': ['exam_result_publish'],
  'exam_lock': ['exam_lock'],

  // Examinations Phase 2 (Tranche 2c): correction-request/approval workflow.
  // exam_correction_view/exam_correction_request are aliased to exam_manage,
  // same convention as exam_view/exam_marks_enter above. exam_correction_approve
  // is deliberately given NO alias (explicit-grant-only), matching the
  // exam_marks_verify/exam_result_publish/exam_lock pattern for sensitive
  // actions that bypass a LOCKED exam's normal guard.
  'exam_correction_view': ['exam_correction_view', 'exam_view', 'exam_manage'],
  'exam_correction_request': ['exam_correction_request', 'exam_marks_enter', 'exam_manage'],
  'exam_correction_approve': ['exam_correction_approve'],

  // Wave 3 (Exams/Finance/Admin/Operations remediation, Sept 2026):
  // audit_manage is a newly-seeded, real catalog permission (previously checked
  // by frontend+backend but unassignable to any role). error_log_view is split
  // out of the shared audit_view code so Error Monitoring can be granted
  // independently of Audit Logs; any role that already held audit_view or
  // audit_manage keeps working immediately, same backward-compatibility
  // pattern used throughout this file.
  'audit_manage': ['audit.manage', 'audit_manage'],
  'error_log_view': ['error_log_view', 'audit_view', 'audit_manage'],

  // Visitors: the frontend's Check-In/Check-Out/Issue-Gate-Pass/Redeem-Exit
  // actions all check the broad visitor_manage code; the backend requires the
  // narrower visitor_checkin/gate_pass_create/gate_pass_use codes. A broad
  // visitor_manage grant is intended to imply these narrower actions.
  'visitor_checkin': ['visitor_checkin', 'visitor_manage'],
  'gate_pass_create': ['gate_pass_create', 'visitor_manage'],
  'gate_pass_use': ['gate_pass_use', 'visitor_manage'],

  // Assets: broad asset_manage grant implies the narrower assign/dispose actions.
  'asset_assign': ['asset_assign', 'asset_manage'],
  'asset_dispose': ['asset_dispose', 'asset_manage'],

  // Hostel: broad hostel_manage grant implies allocation management (allocate/vacate).
  // hostel_allocation_view is a distinct, already-seeded code; a role with the
  // broader hostel_manage or the base hostel_view keeps seeing Allocations.
  'hostel_allocation_manage': ['hostel_allocation_manage', 'hostel_manage'],
  'hostel_allocation_view': ['hostel_allocation_view', 'hostel_view', 'hostel_manage'],

  // Inventory: broad inventory_manage grant implies stock adjustments.
  'stock_adjust': ['stock_adjust', 'inventory_manage'],
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
