const Staff = require('../models/Staff');
const User = require('../models/User');
const Role = require('../models/Role');
const Section = require('../models/Section');
const TeacherAssignment = require('../models/TeacherAssignment');
const Department = require('../models/Department');
const Qualification = require('../models/Qualification');
const Designation = require('../models/Designation');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { resolveScopedStaffIds } = require('../services/staffAccessScopeService');

// Staff In-Charge / Class Teacher guard for single-record staff endpoints —
// throws the same NotFoundError a wrong-schoolId lookup already throws, so an
// out-of-scope record is indistinguishable from a nonexistent one. A staff
// member can always see/act on their own record regardless of scope.
async function assertStaffInScope(req, schoolId, staffId) {
  const scope = req.staffAccessScope;
  if (!scope || scope.mode === 'ALL') return;
  if (scope.staffId && String(scope.staffId) === String(staffId)) return;
  const allowed = await resolveScopedStaffIds(scope, schoolId);
  if (allowed !== null && !allowed.includes(String(staffId))) {
    throw new NotFoundError('Staff member not found.');
  }
}

const getStaff = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, includeArchived, isTeachingStaff, department, search, employeeId, apiLevel } = req.query;

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

    const allowedStaffIds = await resolveScopedStaffIds(req.staffAccessScope, schoolId);
    if (allowedStaffIds !== null) {
      filter._id = { $in: allowedStaffIds };
    }

    if (apiLevel === 'master') {
      const masterStaff = await Staff.find(filter)
        .select('_id firstName lastName employeeId email phone qualification designation')
        .sort({ createdAt: -1 })
        .lean();
      return successResponse(res, masterStaff, 'Staff members retrieved successfully');
    }

    const staff = await Staff.find(filter)
      .populate('userId', 'name email phone status')
      .populate('departmentId', 'name code')
      .populate('designationId', 'name code')
      .populate('assignedGradeIds', 'name code')
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
      .populate('designationId', 'name code')
      .populate('assignedGradeIds', 'name code')
      .populate('qualificationIds', 'name code level')
      .lean();

    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }
    await assertStaffInScope(req, schoolId, staff._id);

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

    let finalDesigId = req.body.designationId || null;
    let finalDesigName = designation || '';
    if (finalDesigId) {
      const desig = await Designation.findById(finalDesigId).lean();
      if (desig) finalDesigName = desig.name;
    } else if (finalDesigName) {
      const desig = await Designation.findOne({
        schoolId,
        name: new RegExp(`^${finalDesigName.trim()}$`, 'i'),
      }).lean();
      if (desig) {
        finalDesigId = desig._id;
        finalDesigName = desig.name;
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
      existing.designation = finalDesigName;
      existing.designationId = finalDesigId;
      existing.departmentId = finalDeptId;
      existing.department = finalDeptName;
      existing.qualificationIds = finalQualIds;
      existing.qualification = finalQualStr;
      existing.experienceYears = Number(experienceYears) || 0;
      existing.isTeachingStaff = resolvedIsTeaching;
      existing.assignedGradeIds = Array.isArray(req.body.assignedGradeIds) ? req.body.assignedGradeIds : [];
      existing.isIncharge = Boolean(req.body.isIncharge) || false;
      existing.inchargeDetails = {
        gradeIds: Array.isArray(req.body.inchargeDetails?.gradeIds) ? req.body.inchargeDetails.gradeIds : [],
      };
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
        designation: finalDesigName,
        designationId: finalDesigId,
        departmentId: finalDeptId,
        department: finalDeptName,
        qualificationIds: finalQualIds,
        qualification: finalQualStr,
        experienceYears: Number(experienceYears) || 0,
        joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
        isTeachingStaff: resolvedIsTeaching,
        assignedGradeIds: Array.isArray(req.body.assignedGradeIds) ? req.body.assignedGradeIds : [],
        isIncharge: Boolean(req.body.isIncharge) || false,
        inchargeDetails: {
          gradeIds: Array.isArray(req.body.inchargeDetails?.gradeIds) ? req.body.inchargeDetails.gradeIds : [],
        },
        status: 'ACTIVE',
      });
    }

    const populatedStaff = await Staff.findById(staff._id)
      .populate('userId')
      .populate('departmentId', 'name code')
      .populate('designationId', 'name code')
      .populate('assignedGradeIds', 'name code')
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
    await assertStaffInScope(req, schoolId, id);

    const oldValues = staff.toObject();
    const updateData = { ...req.body };
    delete updateData.employeeId;
    delete updateData.schoolId;

    if (updateData.firstName !== undefined) staff.firstName = String(updateData.firstName).trim();
    if (updateData.lastName !== undefined) staff.lastName = String(updateData.lastName).trim();
    if (updateData.email !== undefined) staff.email = String(updateData.email).toLowerCase().trim();
    if (updateData.phone !== undefined) staff.phone = String(updateData.phone).trim();
    if (updateData.isTeachingStaff !== undefined) staff.isTeachingStaff = Boolean(updateData.isTeachingStaff);
    if (Array.isArray(updateData.assignedGradeIds)) staff.assignedGradeIds = updateData.assignedGradeIds;
    if (updateData.isIncharge !== undefined) staff.isIncharge = Boolean(updateData.isIncharge);
    if (updateData.inchargeDetails !== undefined) {
      staff.inchargeDetails = {
        gradeIds: Array.isArray(updateData.inchargeDetails?.gradeIds) ? updateData.inchargeDetails.gradeIds : [],
      };
    }

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

    if (updateData.designationId !== undefined) {
      if (updateData.designationId) {
        const desig = await Designation.findById(updateData.designationId).lean();
        if (desig) {
          staff.designationId = desig._id;
          staff.designation = desig.name;
        }
      } else {
        staff.designationId = null;
        if (updateData.designation === undefined) staff.designation = '';
      }
    } else if (updateData.designation) {
      const desig = await Designation.findOne({
        schoolId,
        name: new RegExp(`^${updateData.designation.trim()}$`, 'i'),
      }).lean();
      if (desig) {
        staff.designationId = desig._id;
        staff.designation = desig.name;
      } else {
        staff.designation = updateData.designation;
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
      .populate('designationId', 'name code')
      .populate('assignedGradeIds', 'name code')
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
    await assertStaffInScope(req, schoolId, id);

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
    await assertStaffInScope(req, schoolId, id);

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

const bulkImportStaff = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const staffRecords = req.body.staff;

    if (!Array.isArray(staffRecords) || staffRecords.length === 0) {
      throw new ValidationError('A non-empty "staff" array is required.');
    }

    // Pre-fetch roles, departments, designations
    const [teacherRole, staffRole, departments, designations] = await Promise.all([
      Role.findOne({ code: 'TEACHER' }).lean(),
      Role.findOne({ code: 'STAFF' }).lean(),
      Department.find({ schoolId }).lean(),
      Designation.find({ schoolId }).lean(),
    ]);

    const deptMap = new Map();
    departments.forEach((d) => {
      deptMap.set(d.name.toLowerCase().trim(), d);
      if (d.code) deptMap.set(d.code.toLowerCase().trim(), d);
    });

    const desigMap = new Map();
    designations.forEach((d) => {
      desigMap.set(d.name.toLowerCase().trim(), d);
      if (d.code) desigMap.set(d.code.toLowerCase().trim(), d);
    });

    const results = {
      total: staffRecords.length,
      importedCount: 0,
      skippedCount: 0,
      errors: [],
      importedStaff: [],
    };

    const seenEmployeeIdsInBatch = new Set();
    const defaultPasswordHash = await bcrypt.hash('password123', 10);

    for (let i = 0; i < staffRecords.length; i++) {
      const row = staffRecords[i];
      const rowNum = i + 1;
      const rowErrors = [];

      const rawEmpId = String(row.employeeId || '').trim().toUpperCase();
      if (!rawEmpId) {
        rowErrors.push('Employee ID is required');
      } else if (seenEmployeeIdsInBatch.has(rawEmpId)) {
        rowErrors.push(`Duplicate Employee ID "${rawEmpId}" within same import sheet`);
      } else {
        seenEmployeeIdsInBatch.add(rawEmpId);
      }

      const rawFirstName = String(row.firstName || '').trim();
      const rawLastName = String(row.lastName || '').trim();
      const rawFullName = String(row.name || `${rawFirstName} ${rawLastName}`).trim();
      if (!rawFullName) {
        rowErrors.push('Staff Name is required');
      }

      const phone = String(row.phone || '').trim();
      const email = String(
        row.email || (rawEmpId ? `${rawEmpId.toLowerCase()}@school.internal` : '')
      ).toLowerCase().trim();

      const isTeaching =
        row.isTeachingStaff === true ||
        String(row.isTeachingStaff || '').toUpperCase() === 'YES' ||
        String(row.isTeachingStaff || '').toUpperCase() === 'TRUE';

      const designationStr = String(row.designation || (isTeaching ? 'Teacher' : 'Staff')).trim();
      const departmentStr = String(row.department || '').trim();

      const matchedDept = departmentStr ? deptMap.get(departmentStr.toLowerCase()) : null;
      const matchedDesig = designationStr ? desigMap.get(designationStr.toLowerCase()) : null;

      const qualificationStr = String(row.qualification || '').trim();
      const experienceYears = Number(row.experienceYears) >= 0 ? Number(row.experienceYears) : 0;
      const status = ['ACTIVE', 'INACTIVE'].includes(String(row.status || '').toUpperCase())
        ? String(row.status).toUpperCase()
        : 'ACTIVE';

      if (rowErrors.length > 0) {
        results.skippedCount++;
        results.errors.push({
          row: rowNum,
          name: rawFullName || `Row ${rowNum}`,
          errors: rowErrors,
        });
        continue;
      }

      // Check existing staff
      let staff = await Staff.findOne({ schoolId, employeeId: rawEmpId });
      let user = null;

      if (email) {
        user = await User.findOne({ email });
      }

      const targetRole = isTeaching ? teacherRole : staffRole;
      const roleId = targetRole?._id || null;

      if (!user) {
        user = await User.create({
          schoolId,
          roleId,
          email: email || `${rawEmpId.toLowerCase()}@school.internal`,
          password: defaultPasswordHash,
          name: rawFullName,
          phone: phone || '',
          status: 'ACTIVE',
        });
      } else {
        if (roleId && !user.roleId) user.roleId = roleId;
        if (rawFullName) user.name = rawFullName;
        if (phone && !user.phone) user.phone = phone;
        await user.save();
      }

      if (staff) {
        staff.userId = user._id;
        staff.firstName = rawFirstName || rawFullName.split(' ')[0] || '';
        staff.lastName = rawLastName || rawFullName.split(' ').slice(1).join(' ') || '';
        staff.email = email;
        staff.phone = phone;
        staff.designation = designationStr;
        staff.designationId = matchedDesig?._id || staff.designationId || null;
        staff.department = departmentStr;
        staff.departmentId = matchedDept?._id || staff.departmentId || null;
        staff.qualification = qualificationStr || staff.qualification;
        staff.experienceYears = experienceYears;
        staff.isTeachingStaff = isTeaching;
        staff.status = status;
        await staff.save();
      } else {
        staff = await Staff.create({
          schoolId,
          userId: user._id,
          employeeId: rawEmpId,
          firstName: rawFirstName || rawFullName.split(' ')[0] || '',
          lastName: rawLastName || rawFullName.split(' ').slice(1).join(' ') || '',
          email,
          phone,
          designation: designationStr,
          designationId: matchedDesig?._id || null,
          department: departmentStr,
          departmentId: matchedDept?._id || null,
          qualification: qualificationStr,
          experienceYears,
          isTeachingStaff: isTeaching,
          status,
        });
      }

      results.importedCount++;
      results.importedStaff.push({
        id: staff._id,
        employeeId: staff.employeeId,
        name: rawFullName,
        designation: staff.designation,
        department: staff.department,
        isTeachingStaff: staff.isTeachingStaff,
        status: staff.status,
      });
    }

    logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'BULK_IMPORT',
      entity: 'Staff',
      entityId: schoolId.toString(),
      newValues: {
        total: results.total,
        importedCount: results.importedCount,
        skippedCount: results.skippedCount,
      },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, results, `Successfully imported ${results.importedCount} staff members`);
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
  bulkImportStaff,
};

