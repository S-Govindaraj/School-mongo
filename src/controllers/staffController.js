const Staff = require('../models/Staff');
const User = require('../models/User');
const Role = require('../models/Role');
const TeacherAssignment = require('../models/TeacherAssignment');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const bcrypt = require('bcryptjs');

const getStaff = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, includeArchived } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }

    const staff = await Staff.find(filter)
      .populate('userId')
      .sort({ createdAt: -1 });

    return successResponse(res, staff, 'Staff members retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getStaffById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const staff = await Staff.findOne({
      _id: req.params.id,
      schoolId,
      status: { $ne: 'ARCHIVED' },
    }).populate('userId');

    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    return successResponse(res, staff, 'Staff member retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createStaff = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const {
      employeeId,
      name,
      firstName,
      lastName,
      email,
      phone,
      designation,
      department = '',
      qualification = '',
      experienceYears = 0,
      joiningDate,
      employmentStatus = 'TEACHING',
    } = req.body;

    const formattedEmpId = String(employeeId || '').trim().toUpperCase();

    const existing = await Staff.findOne({ schoolId, employeeId: formattedEmpId });
    if (existing && existing.status !== 'ARCHIVED') {
      throw new ValidationError(`Employee ID '${formattedEmpId}' already exists in this school.`);
    }

    const fullName = name || `${firstName || ''} ${lastName || ''}`.trim() || `Staff ${formattedEmpId}`;
    const staffEmail = String(email || `${formattedEmpId.toLowerCase()}@school.internal`).toLowerCase().trim();

    // Check if user profile exists or create standard user account
    let user = await User.findOne({ email: staffEmail });
    if (!user) {
      const defaultRole = await Role.findOne({ code: 'TEACHER' }) || await Role.findOne({ code: 'STAFF' });
      const hashedPassword = await bcrypt.hash('password123', 10);
      user = await User.create({
        schoolId,
        roleId: defaultRole?._id,
        email: staffEmail,
        password: hashedPassword,
        name: fullName,
        phone: phone || '',
        status: 'ACTIVE',
      });
    }

    let staff;
    if (existing && existing.status === 'ARCHIVED') {
      existing.designation = designation;
      existing.department = department;
      existing.qualification = qualification;
      existing.experienceYears = Number(experienceYears);
      existing.userId = user._id;
      existing.status = 'ACTIVE';
      staff = await existing.save();
    } else {
      staff = await Staff.create({
        schoolId,
        userId: user._id,
        employeeId: formattedEmpId,
        designation,
        department,
        qualification,
        experienceYears: Number(experienceYears),
        joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
        status: 'ACTIVE',
      });
    }

    const populatedStaff = await Staff.findById(staff._id).populate('userId');

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'CREATE',
      entity: 'Staff',
      entityId: staff._id.toString(),
      newValues: staff.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, populatedStaff, 'Staff member created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateStaff = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const staff = await Staff.findOne({ _id: id, schoolId });
    if (!staff) {
      throw new NotFoundError('Staff member not found.');
    }

    const oldValues = staff.toObject();
    Object.assign(staff, req.body);
    await staff.save();

    if (staff.userId && req.body.name) {
      await User.findByIdAndUpdate(staff.userId, { name: req.body.name, phone: req.body.phone });
    }

    const updated = await Staff.findById(id).populate('userId');

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UPDATE',
      entity: 'Staff',
      entityId: staff._id.toString(),
      oldValues,
      newValues: staff.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, updated, 'Staff member updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteStaff = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const staff = await Staff.findOne({ _id: id, schoolId });
    if (!staff) {
      throw new NotFoundError('Staff member not found.');
    }

    staff.status = 'INACTIVE';
    await staff.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'DEACTIVATE',
      entity: 'Staff',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Staff member deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restoreStaff = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const staff = await Staff.findOne({ _id: id, schoolId });
    if (!staff) {
      throw new NotFoundError('Staff member not found.');
    }

    const oldValues = staff.toObject();
    staff.status = 'ACTIVE';
    await staff.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'ACTIVATE',
      entity: 'Staff',
      entityId: id,
      oldValues,
      newValues: staff.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, staff, 'Staff member activated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
  restoreStaff,
};
