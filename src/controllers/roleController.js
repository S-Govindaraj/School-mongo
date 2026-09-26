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

    // Retrieve system roles + school roles
    const query = {
      $or: [{ isSystem: true }, { schoolId }],
      status: { $ne: 'ARCHIVED' },
    };

    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (roleType === 'SYSTEM') {
      query.isSystem = true;
    } else if (roleType === 'CUSTOM') {
      query.isSystem = false;
      query.schoolId = schoolId;
    }
    if (hierarchyLevel !== undefined && hierarchyLevel !== '' && hierarchyLevel !== 'ALL') {
      query.hierarchyLevel = Number(hierarchyLevel);
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

const getPermissions = async (req, res, next) => {
  try {
    const permissions = await Permission.find({}).sort({ module: 1, name: 1 });

    const grouped = permissions.reduce((acc, p) => {
      const mod = p.module || 'General';
      if (!acc[mod]) acc[mod] = [];
      const codeNormalized = (p.code || '').replace(/\./g, '_');
      acc[mod].push({
        id: p._id,
        module: p.module,
        action: p.action,
        code: codeNormalized,
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
          code: (p.code || '').replace(/\./g, '_'),
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
