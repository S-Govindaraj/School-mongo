const Role = require('../models/Role');
const User = require('../models/User');
const Permission = require('../models/Permission');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Get all Roles with single payload format (KPI + Records + 50-item Pagination)
 */
const getRoles = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const search = (req.query.search || '').trim().toLowerCase();

    const roles = await Role.find({}).sort({ hierarchyLevel: 1 });

    // Compute user counts per role
    const userCounts = await User.aggregate([
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
      permissions: r.permissions || [],
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

    return successResponse(res, {
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
    }, 'Roles retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get single role by ID
 */
const getRoleById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = await Role.findById(id);

    if (!role) {
      return errorResponse(res, 'Role not found', 404, 'NOT_FOUND');
    }

    const userCount = await User.countDocuments({ roleId: role._id });

    const formattedRole = {
      id: role._id,
      name: role.name,
      code: role.code,
      description: role.description || '',
      hierarchyLevel: role.hierarchyLevel,
      isSystem: role.isSystem,
      status: role.status,
      isActive: role.status === 'ACTIVE',
      userCount,
      permissions: role.permissions || [],
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };

    return successResponse(res, formattedRole, 'Role details retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new Role
 */
const createRole = async (req, res, next) => {
  try {
    const { name, code, description, hierarchyLevel = 5, permissions = [] } = req.body;

    if (!name || !code) {
      return errorResponse(res, 'Role name and code are required', 400, 'VALIDATION_ERROR');
    }

    const formattedCode = code.trim().toUpperCase().replace(/\s+/g, '_');

    const existing = await Role.findOne({ code: formattedCode });
    if (existing) {
      return errorResponse(res, `Role code '${formattedCode}' already exists`, 400, 'DUPLICATE_CODE');
    }

    const newRole = await Role.create({
      name,
      code: formattedCode,
      description: description || '',
      hierarchyLevel: Number(hierarchyLevel) || 5,
      schoolId: req.user?.schoolId || null,
      permissions: Array.isArray(permissions) ? permissions : [],
    });

    const result = {
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
    };

    return successResponse(res, result, 'Role created successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing Role
 */
const updateRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, hierarchyLevel, status, permissions } = req.body;

    const existingRole = await Role.findById(id);
    if (!existingRole) {
      return errorResponse(res, 'Role not found', 404, 'NOT_FOUND');
    }

    if (name !== undefined) existingRole.name = name;
    if (description !== undefined) existingRole.description = description;
    if (hierarchyLevel !== undefined) existingRole.hierarchyLevel = Number(hierarchyLevel);
    if (status !== undefined) existingRole.status = status;
    if (Array.isArray(permissions)) existingRole.permissions = permissions;

    await existingRole.save();

    const userCount = await User.countDocuments({ roleId: existingRole._id });

    const result = {
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
    };

    return successResponse(res, result, 'Role updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle Role Status
 */
const toggleRoleStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = await Role.findById(id);
    if (!role) {
      return errorResponse(res, 'Role not found', 404, 'NOT_FOUND');
    }

    role.status = role.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await role.save();

    return successResponse(
      res,
      { id: role._id, status: role.status, isActive: role.status === 'ACTIVE' },
      `Role ${role.status === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a Role
 */
const deleteRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = await Role.findById(id);

    if (!role) {
      return errorResponse(res, 'Role not found', 404, 'NOT_FOUND');
    }

    if (role.isSystem) {
      return errorResponse(res, 'System roles cannot be deleted', 403, 'FORBIDDEN');
    }

    const assignedUsers = await User.countDocuments({ roleId: role._id });
    if (assignedUsers > 0) {
      return errorResponse(
        res,
        `Cannot delete role because ${assignedUsers} user(s) are currently assigned to it.`,
        400,
        'ROLE_IN_USE'
      );
    }

    await Role.findByIdAndDelete(id);
    return successResponse(res, null, 'Role deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Permissions
 */
const getPermissions = async (req, res, next) => {
  try {
    const permissions = await Permission.find({}).sort({ module: 1, name: 1 });

    const grouped = permissions.reduce((acc, p) => {
      const mod = p.module || 'General';
      if (!acc[mod]) acc[mod] = [];
      acc[mod].push({
        id: p._id,
        module: p.module,
        action: p.action,
        code: p.code,
        name: p.name,
        description: p.description,
      });
      return acc;
    }, {});

    return successResponse(
      res,
      {
        all: permissions.map((p) => ({
          id: p._id,
          module: p.module,
          action: p.action,
          code: p.code,
          name: p.name,
          description: p.description,
        })),
        grouped,
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
