const Staff = require('../models/Staff');
const User = require('../models/User');
const Role = require('../models/Role');
const Section = require('../models/Section');
const TeacherAssignment = require('../models/TeacherAssignment');
const Department = require('../models/Department');
const Qualification = require('../models/Qualification');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const getStaff = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, includeArchived, isTeachingStaff, department, search, employeeId } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }
    if (isTeachingStaff !== undefined && isTeachingStaff !== '' && isTeachingStaff !== 'ALL') {
      filter.isTeachingStaff = isTeachingStaff === 'true';
    }
    if (employeeId && employeeId.trim() && employeeId !== 'ALL') {
      filter.employeeId = new RegExp(employeeId.trim(), 'i');
    }
    if (department && department !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(department)) {
        filter.$or = [{ departmentId: department }, { department: department }];
      } else {
        filter.department = department;
      }
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { employeeId: regex },
        { designation: regex },
        { email: regex },
        { phone: regex },
        { department: regex },
      ];
    }

    const staff = await Staff.find(filter)
      .populate('userId', 'name email phone status')
      .populate('departmentId', 'name code')
      .populate('qualificationIds', 'name code level')
      .sort({ createdAt: -1 })
      .lean();

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
    })
      .populate('userId')
      .populate('departmentId', 'name code')
      .populate('qualificationIds', 'name code level')
      .lean();

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
    const finalFirstName = String(firstName || '').trim();
    const finalLastName = String(lastName || '').trim();
    const fullName = name || `${finalFirstName} ${finalLastName}`.trim() || `Staff ${formattedEmpId}`;
    const staffEmail = String(email || `${formattedEmpId.toLowerCase()}@school.internal`).toLowerCase().trim();

    // Check if staff, user profile, and default role exist in parallel
    const [existing, existingUser, defaultRole] = await Promise.all([
      Staff.findOne({ schoolId, employeeId: formattedEmpId }),
      User.findOne({ email: staffEmail }),
      Role.findOne({ code: 'TEACHER' }).then(r => r || Role.findOne({ name: /teacher/i }) || Role.findOne({ code: 'STAFF' })),
    ]);

    if (existing && existing.status !== 'ARCHIVED') {
      throw new ValidationError(`Employee ID '${formattedEmpId}' already exists in this school.`);
    }

    const assignedRoleId = req.body.roleId || defaultRole?._id;

    let user = existingUser;
    if (!user) {
      const plainPassword = (req.body.createUserAccount && req.body.password && String(req.body.password).trim()) 
        ? String(req.body.password).trim() 
        : 'password123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      user = await User.create({
        schoolId,
        roleId: assignedRoleId,
        email: staffEmail,
        password: hashedPassword,
        name: fullName,
        phone: phone || '',
        status: 'ACTIVE',
      });
    } else if (req.body.roleId) {
      user.roleId = req.body.roleId;
      if (fullName) user.name = fullName;
      if (phone) user.phone = phone;
      await user.save();
    }

    let finalDeptId = req.body.departmentId || null;
    let finalDeptName = department || '';
    if (finalDeptId) {
      const dept = await Department.findById(finalDeptId).lean();
      if (dept) finalDeptName = dept.name;
    } else if (finalDeptName) {
      const dept = await Department.findOne({
        schoolId,
        $or: [{ name: new RegExp(`^${finalDeptName.trim()}$`, 'i') }, { code: finalDeptName.trim().toUpperCase() }],
      }).lean();
      if (dept) {
        finalDeptId = dept._id;
        finalDeptName = dept.name;
      }
    }

    let finalQualIds = Array.isArray(req.body.qualificationIds) ? req.body.qualificationIds : [];
    let finalQualStr = qualification || '';
    if (finalQualIds.length > 0) {
      const quals = await Qualification.find({ _id: { $in: finalQualIds } }).lean();
      const qualMap = new Map(quals.map((q) => [q._id.toString(), q.name]));
      finalQualStr = finalQualIds.map((qId) => qualMap.get(qId.toString())).filter(Boolean).join(', ');
    }

    const resolvedIsTeaching = req.body.isTeachingStaff !== undefined 
      ? Boolean(req.body.isTeachingStaff) 
      : (employmentStatus === 'TEACHING');

    let staff;
    if (existing && existing.status === 'ARCHIVED') {
      existing.userId = user._id;
      existing.firstName = finalFirstName;
      existing.lastName = finalLastName;
      existing.email = staffEmail;
      existing.phone = phone || '';
      existing.designation = designation;
      existing.departmentId = finalDeptId;
      existing.department = finalDeptName;
      existing.qualificationIds = finalQualIds;
      existing.qualification = finalQualStr;
      existing.experienceYears = Number(experienceYears) || 0;
      existing.isTeachingStaff = resolvedIsTeaching;
      existing.status = 'ACTIVE';
      staff = await existing.save();
    } else {
      staff = await Staff.create({
        schoolId,
        userId: user._id,
        employeeId: formattedEmpId,
        firstName: finalFirstName,
        lastName: finalLastName,
        email: staffEmail,
        phone: phone || '',
        designation,
        departmentId: finalDeptId,
        department: finalDeptName,
        qualificationIds: finalQualIds,
        qualification: finalQualStr,
        experienceYears: Number(experienceYears) || 0,
        joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
        isTeachingStaff: resolvedIsTeaching,
        status: 'ACTIVE',
      });
    }

    const populatedStaff = await Staff.findById(staff._id)
      .populate('userId')
      .populate('departmentId', 'name code')
      .populate('qualificationIds', 'name code level')
      .lean();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'CREATE',
      entity: 'Staff',
      entityId: staff._id.toString(),
      newValues: staff.toObject ? staff.toObject() : staff,
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
    const updateData = { ...req.body };
    delete updateData.employeeId;
    delete updateData.schoolId;

    if (updateData.firstName !== undefined) staff.firstName = String(updateData.firstName).trim();
    if (updateData.lastName !== undefined) staff.lastName = String(updateData.lastName).trim();
    if (updateData.email !== undefined) staff.email = String(updateData.email).toLowerCase().trim();
    if (updateData.phone !== undefined) staff.phone = String(updateData.phone).trim();
    if (updateData.isTeachingStaff !== undefined) staff.isTeachingStaff = Boolean(updateData.isTeachingStaff);

    if (updateData.departmentId !== undefined) {
      if (updateData.departmentId) {
        const dept = await Department.findById(updateData.departmentId).lean();
        if (dept) {
          staff.departmentId = dept._id;
          staff.department = dept.name;
        }
      } else {
        staff.departmentId = null;
        if (updateData.department === undefined) staff.department = '';
      }
    } else if (updateData.department) {
      const dept = await Department.findOne({
        schoolId,
        $or: [{ name: new RegExp(`^${updateData.department.trim()}$`, 'i') }, { code: updateData.department.trim().toUpperCase() }],
      }).lean();
      if (dept) {
        staff.departmentId = dept._id;
        staff.department = dept.name;
      } else {
        staff.department = updateData.department;
      }
    }

    if (Array.isArray(updateData.qualificationIds)) {
      staff.qualificationIds = updateData.qualificationIds;
      if (updateData.qualificationIds.length > 0) {
        const quals = await Qualification.find({ _id: { $in: updateData.qualificationIds } }).lean();
        const qualMap = new Map(quals.map((q) => [q._id.toString(), q.name]));
        staff.qualification = updateData.qualificationIds
          .map((qId) => qualMap.get(qId.toString()))
          .filter(Boolean)
          .join(', ');
      } else {
        staff.qualification = '';
      }
    }

    Object.assign(staff, updateData);
    await staff.save();

    if (staff.userId) {
      const userUpdates = {};
      const newFullName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || req.body.name;
      if (newFullName) userUpdates.name = newFullName;
      if (staff.phone) userUpdates.phone = staff.phone;
      if (staff.email) userUpdates.email = staff.email;
      if (req.body.roleId) userUpdates.roleId = req.body.roleId;
      if (Object.keys(userUpdates).length > 0) {
        await User.findByIdAndUpdate(staff.userId, userUpdates);
      }
    }

    const updated = await Staff.findById(id)
      .populate('userId')
      .populate('departmentId', 'name code')
      .populate('qualificationIds', 'name code level')
      .lean();

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

    // Check if staff member is currently assigned as Class Teacher for any active section
    const activeSection = await Section.findOne({
      schoolId,
      classTeacherId: id,
      status: { $ne: 'ARCHIVED' },
    }).populate('gradeId', 'name');

    if (activeSection) {
      const gradeName = activeSection.gradeId?.name || 'Class';
      const sectionName = activeSection.name || 'Section';
      throw new ValidationError(
        `Cannot deactivate "${staff.firstName} ${staff.lastName}" because they are currently assigned as Class Teacher for Section "${sectionName}" (${gradeName}). Please reassign or unassign the class teacher from that section first.`
      );
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
