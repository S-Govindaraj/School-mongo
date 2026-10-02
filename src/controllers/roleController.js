const Role = require('../models/Role');
const User = require('../models/User');
const Permission = require('../models/Permission');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getRoles = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const search = (req.query.search || '').trim().toLowerCase();
    const status = (req.query.status || '').trim();
    const roleType = (req.query.roleType || '').trim();
    const hierarchyLevel = req.query.hierarchyLevel;
    const { apiLevel } = req.query;

    // Ensure a standard Teacher role exists in the database
    let teacherRole = await Role.findOne({ code: 'TEACHER' });
    if (!teacherRole) {
      teacherRole = await Role.create({
        name: 'Teacher',
        code: 'TEACHER',
        description: 'Educator and Classroom Teacher with academic permissions',
        hierarchyLevel: 4,
        isSystem: true,
        schoolId: null,
        status: 'ACTIVE',
        permissions: ['staff_view', 'teacher_view', 'grade_view', 'section_view', 'subject_view', 'class_subject_view', 'teacher_assignment_view', 'mobile_app_view', 'mobile_sync_view'],
      });
    } else if (teacherRole.name !== 'Teacher' || !teacherRole.isSystem) {
      teacherRole.name = 'Teacher';
      teacherRole.isSystem = true;
      await teacherRole.save();
    }

    // Retrieve system roles (isSystem: true or schoolId: null) + current school roles
    const query = {
      $or: [{ isSystem: true }, { schoolId: null }, { schoolId }],
      status: { $ne: 'ARCHIVED' },
    };

    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (roleType === 'SYSTEM') {
      query.$or = [{ isSystem: true }, { schoolId: null }];
    } else if (roleType === 'CUSTOM') {
      query.isSystem = false;
      query.schoolId = schoolId;
    }
    if (hierarchyLevel !== undefined && hierarchyLevel !== '' && hierarchyLevel !== 'ALL') {
      query.hierarchyLevel = Number(hierarchyLevel);
    }

    if (apiLevel === 'master') {
      let masterRoles = await Role.find(query).select('_id name code').sort({ hierarchyLevel: 1 }).lean();
      if (search) {
        masterRoles = masterRoles.filter(
          (r) => (r.name || '').toLowerCase().includes(search) || (r.code || '').toLowerCase().includes(search)
        );
      }
      return successResponse(res, masterRoles, 'Roles retrieved successfully');
    }

    const roles = await Role.find(query).sort({ hierarchyLevel: 1 });

    const userCounts = await User.aggregate([
      { $match: { schoolId } },
      { $group: { _id: '$roleId', count: { $sum: 1 } } },
    ]);
    const userCountMap = {};
    userCounts.forEach((u) => {
      if (u._id) userCountMap[u._id.toString()] = u.count;
    });

    const formattedRoles = roles.map((r) => ({
      id: r._id,
      name: r.name,
      code: r.code,
      description: r.description || '',
      hierarchyLevel: r.hierarchyLevel,
      isSystem: r.isSystem,
      status: r.status,
      isActive: r.status === 'ACTIVE',
      userCount: userCountMap[r._id.toString()] || 0,
      permissions: (r.permissions || []).map((p) => (typeof p === 'string' ? p.replace(/\./g, '_') : p)),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const total = formattedRoles.length;
    const system = formattedRoles.filter((r) => r.isSystem).length;
    const custom = total - system;
    const active = formattedRoles.filter((r) => r.isActive).length;

    const filtered = search
      ? formattedRoles.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          r.code.toLowerCase().includes(search) ||
          r.description.toLowerCase().includes(search)
      )
      : formattedRoles;

    const totalRecords = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
    const paginatedRecords = filtered.slice((page - 1) * limit, page * limit);

    return successResponse(
      res,
      {
        kpi: {
          total,
          system,
          custom,
          active,
        },
        records: paginatedRecords,
        pagination: {
          total: totalRecords,
          page,
          limit,
          totalPages,
        },
      },
      'Roles retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

const getRoleById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const role = await Role.findOne({
      _id: id,
      $or: [{ isSystem: true }, { schoolId }],
    });

    if (!role) {
      throw new NotFoundError('Role not found.');
    }

    const userCount = await User.countDocuments({ roleId: role._id, schoolId });

    return successResponse(
      res,
      {
        id: role._id,
        name: role.name,
        code: role.code,
        description: role.description || '',
        hierarchyLevel: role.hierarchyLevel,
        isSystem: role.isSystem,
        status: role.status,
        isActive: role.status === 'ACTIVE',
        userCount,
        permissions: (role.permissions || []).map((p) => (typeof p === 'string' ? p.replace(/\./g, '_') : p)),
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
      'Role details retrieved'
    );
  } catch (error) {
    next(error);
  }
};

const createRole = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code, description = '', hierarchyLevel = 5, permissions = [] } = req.body;

    const formattedCode = String(code || '').trim().toUpperCase().replace(/\s+/g, '_');

    const existing = await Role.findOne({
      code: formattedCode,
      $or: [{ isSystem: true }, { schoolId }],
    });

    if (existing && existing.status !== 'ARCHIVED') {
      throw new ValidationError(`Role code '${formattedCode}' already exists.`);
    }

    let newRole;
    if (existing && existing.status === 'ARCHIVED') {
      existing.name = name;
      existing.description = description;
      existing.hierarchyLevel = Number(hierarchyLevel);
      existing.permissions = Array.isArray(permissions) ? permissions.map((p) => (typeof p === 'string' ? p.replace(/\./g, '_') : p)) : [];
      existing.status = 'ACTIVE';
      newRole = await existing.save();
    } else {
      newRole = await Role.create({
        schoolId,
        name,
        code: formattedCode,
        description,
        hierarchyLevel: Number(hierarchyLevel),
        isSystem: false,
        status: 'ACTIVE',
        permissions: Array.isArray(permissions) ? permissions.map((p) => (typeof p === 'string' ? p.replace(/\./g, '_') : p)) : [],
      });
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'CREATE',
      entity: 'Role',
      entityId: newRole._id.toString(),
      newValues: newRole.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(
      res,
      {
        id: newRole._id,
        name: newRole.name,
        code: newRole.code,
        description: newRole.description || '',
        hierarchyLevel: newRole.hierarchyLevel,
        isSystem: newRole.isSystem,
        status: newRole.status,
        isActive: newRole.status === 'ACTIVE',
        userCount: 0,
        permissions: newRole.permissions || [],
        createdAt: newRole.createdAt,
        updatedAt: newRole.updatedAt,
      },
      'Role created successfully',
      201
    );
  } catch (error) {
    next(error);
  }
};

const updateRole = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const { name, description, hierarchyLevel, status, permissions } = req.body;

    const existingRole = await Role.findOne({
      _id: id,
      $or: [{ isSystem: true }, { schoolId }],
    });

    if (!existingRole) {
      throw new NotFoundError('Role not found.');
    }

    const oldValues = existingRole.toObject();

    if (name !== undefined) existingRole.name = name;
    if (description !== undefined) existingRole.description = description;
    if (hierarchyLevel !== undefined) existingRole.hierarchyLevel = Number(hierarchyLevel);
    if (status !== undefined) existingRole.status = status;
    if (Array.isArray(permissions)) existingRole.permissions = permissions.map((p) => (typeof p === 'string' ? p.replace(/\./g, '_') : p));

    await existingRole.save();

    const userCount = await User.countDocuments({ roleId: existingRole._id, schoolId });

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UPDATE',
      entity: 'Role',
      entityId: existingRole._id.toString(),
      oldValues,
      newValues: existingRole.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(
      res,
      {
        id: existingRole._id,
        name: existingRole.name,
        code: existingRole.code,
        description: existingRole.description || '',
        hierarchyLevel: existingRole.hierarchyLevel,
        isSystem: existingRole.isSystem,
        status: existingRole.status,
        isActive: existingRole.status === 'ACTIVE',
        userCount,
        permissions: existingRole.permissions || [],
        createdAt: existingRole.createdAt,
        updatedAt: existingRole.updatedAt,
      },
      'Role updated successfully'
    );
  } catch (error) {
    next(error);
  }
};

const toggleRoleStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const role = await Role.findOne({
      _id: id,
      $or: [{ isSystem: true }, { schoolId }],
    });

    if (!role) {
      throw new NotFoundError('Role not found.');
    }

    role.status = role.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await role.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: role.status === 'ACTIVE' ? 'ACTIVATE' : 'DEACTIVATE',
      entity: 'Role',
      entityId: role._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(
      res,
      { id: role._id, status: role.status, isActive: role.status === 'ACTIVE' },
      `Role ${role.status === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`
    );
  } catch (error) {
    next(error);
  }
};

const deleteRole = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const role = await Role.findOne({
      _id: id,
      $or: [{ isSystem: true }, { schoolId }],
    });

    if (!role) {
      throw new NotFoundError('Role not found.');
    }

    if (role.isSystem) {
      throw new ForbiddenError('System roles cannot be deleted.');
    }

    const assignedUsers = await User.countDocuments({ roleId: role._id });
    if (assignedUsers > 0) {
      throw new ValidationError(`Cannot delete role because ${assignedUsers} user(s) are currently assigned to it.`);
    }

    role.status = 'ARCHIVED';
    await role.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'ARCHIVE',
      entity: 'Role',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Role archived successfully');
  } catch (error) {
    next(error);
  }
};

// Display-only grouping fixes for the Permissions Matrix (RoleFormPage's
// PermissionPicker) — applied purely in this response, never written back to
// the DB, so nothing needs re-seeding for these to take effect and no other
// consumer of the Permission collection (there is none besides this
// endpoint — confirmed via repo-wide search) is affected.
//
// 1. A handful of catalog rows are pure backward-compat aliases for a
//    permission already shown elsewhere (e.g. `guardian_update` duplicates
//    `guardian_edit`; `teacher_view/create/edit/delete` duplicate
//    `staff_*`; `role_create/edit/delete/activate` duplicate `role_manage`)
//    — they'd otherwise show up as confusing duplicate-looking checkboxes.
//    Hidden here; still fully functional via the alias maps in
//    middleware/auth.js if a role already holds one of these codes.
const RETIRED_COARSE_PERMISSIONS = new Set([
  'academic_year_manage',
  'academic_term_manage',
  'grade_manage',
  'section_manage',
  'subject_manage',
  'class_subject_manage',
  'teacher_assignment_manage',
  'period_manage',
  'room_manage',
  'timetable_manage',
  'timetable_create',
  'timetable_update',
  'timetable_delete',
]);

const isLegacyAliasPermission = (p) =>
  /\(Legacy\)/i.test(p.name || '') ||
  /^Alias for/i.test(p.description || '') ||
  RETIRED_COARSE_PERMISSIONS.has(p.code);

// 2. A few permission codes live under a DB `module` value that doesn't
// match where they actually belong in the UI (e.g. `guardian_*` codes are
// stored under "Student Management"). Reassign just those, by code, for
// display grouping only.
const MODULE_OVERRIDE_BY_CODE = {
  guardian_view: 'Guardians',
  guardian_create: 'Guardians',
  guardian_import: 'Guardians',
  guardian_edit: 'Guardians',
  guardian_active: 'Guardians',
  guardian_inactive: 'Guardians',
  guardian_update: 'Guardians',
  guardian_manage: 'Guardians',
};

// 3. Rename a couple of DB module labels to match the exact sidebar section
// labels they correspond to (devel/front/src/components/layout/Sidebar.jsx).
const MODULE_DISPLAY_RENAME = {
  'Student Management': 'Students',
  'People & Staff': 'Staff & Teachers',
  'Academic Setup': 'Academic Configuration',
};

// 4. Top-level group order — mirrors the sidebar's own section order
// (Sidebar.jsx: Main -> Role Portals -> People -> Academic -> Admissions ->
// Finance & Fees -> Operations -> Communications -> Reports & Analytics ->
// Administration), and within "People", the same Students -> Staff ->
// Guardians order as that section's own nav items / tabs. Any module not
// listed here (future additions) sorts alphabetically after everything
// listed, rather than disappearing.
const MODULE_ORDER = [
  'Portals',
  'Students', 'Staff & Teachers', 'Guardians', 'HRMS', 'Payroll',
  'Academic Configuration', 'Academic Operations', 'Attendance & Leave', 'Examinations',
  'Admissions & Enrollment',
  'Finance & Fees', 'Finance & Billing', 'Finance & Refunds', 'Finance & Ledger', 'Finance Reporting',
  'Transport', 'Library', 'Inventory', 'Procurement', 'Hostel', 'Assets', 'Visitors',
  'Documents',
  'Notifications', 'Communications', 'Messaging',
  'Analytics', 'Reports', 'Exports',
  'School Setup', 'Roles & Access Control', 'System & Audit',
  'SaaS', 'Mobile & PWA',
];

// 5. Within a group, order by action verb (view first, then the usual CRUD
// sequence, then anything else alphabetically) instead of alphabetical by
// name — matches the `<module>_view/_create/_edit/_active/_inactive`
// convention the rest of the app's permission codes already follow.
const ACTION_ORDER = ['view', 'create', 'import', 'edit', 'update', 'active', 'inactive', 'delete', 'archive', 'approve', 'manage'];

const getPermissions = async (req, res, next) => {
  try {
    const permissions = await Permission.find({}).lean();

    const visible = permissions.filter((p) => !isLegacyAliasPermission(p));

    const toApiShape = (p) => ({
      id: p._id,
      module: MODULE_OVERRIDE_BY_CODE[p.code] || MODULE_DISPLAY_RENAME[p.module] || p.module || 'General',
      action: p.action,
      code: (p.code || '').replace(/\./g, '_'),
      name: p.name,
      description: p.description,
    });

    const grouped = visible.reduce((acc, raw) => {
      const p = toApiShape(raw);
      if (!acc[p.module]) acc[p.module] = [];
      acc[p.module].push(p);
      return acc;
    }, {});

    const moduleRank = (mod) => {
      const idx = MODULE_ORDER.indexOf(mod);
      return idx === -1 ? MODULE_ORDER.length : idx;
    };
    const actionRank = (action) => {
      const idx = ACTION_ORDER.indexOf(action);
      return idx === -1 ? ACTION_ORDER.length : idx;
    };

    const orderedGrouped = {};
    Object.keys(grouped)
      .sort((a, b) => moduleRank(a) - moduleRank(b) || a.localeCompare(b))
      .forEach((mod) => {
        orderedGrouped[mod] = grouped[mod].sort(
          (a, b) => actionRank(a.action) - actionRank(b.action) || (a.name || '').localeCompare(b.name || '')
        );
      });

    return successResponse(
      res,
      {
        all: visible.map(toApiShape),
        grouped: orderedGrouped,
      },
      'Permissions retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  toggleRoleStatus,
  deleteRole,
  getPermissions,
};
