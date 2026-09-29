const Department = require('../models/Department');
const Staff = require('../models/Staff');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getDepartments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, search, apiLevel } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    }
    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { code: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    if (apiLevel === 'master') {
      const masterDepartments = await Department.find(filter).select('_id name code').sort({ name: 1 }).lean();
      return successResponse(res, masterDepartments, 'Departments retrieved successfully');
    }

    const departments = await Department.find(filter)
      .populate('headStaffId', 'firstName lastName employeeId email')
      .sort({ name: 1 })
      .lean();

    return successResponse(res, departments, 'Departments retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getDepartmentById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const dept = await Department.findOne({ _id: id, schoolId })
      .populate('headStaffId', 'firstName lastName employeeId email')
      .lean();

    if (!dept) throw new NotFoundError('Department not found.');

    return successResponse(res, dept, 'Department retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createDepartment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code, description, headStaffId, status = 'ACTIVE' } = req.body;

    if (!name || !name.trim()) throw new ValidationError('Department name is required.');
    if (!code || !code.trim()) throw new ValidationError('Department code is required.');

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    const existing = await Department.findOne({ schoolId, code: cleanCode });
    if (existing) throw new ValidationError(`Department with code '${cleanCode}' already exists.`);

    const dept = await Department.create({
      schoolId,
      code: cleanCode,
      name: cleanName,
      description: description ? description.trim() : '',
      headStaffId: headStaffId || null,
      status,
    });

    return successResponse(res, dept, 'Department created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateDepartment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const dept = await Department.findOne({ _id: id, schoolId });
    if (!dept) throw new NotFoundError('Department not found.');

    const { name, code, description, headStaffId, status } = req.body;

    if (code && code.trim().toUpperCase() !== dept.code) {
      const cleanCode = code.trim().toUpperCase();
      const existing = await Department.findOne({ schoolId, code: cleanCode, _id: { $ne: id } });
      if (existing) throw new ValidationError(`Department with code '${cleanCode}' already exists.`);
      dept.code = cleanCode;
    }

    if (name && name.trim()) dept.name = name.trim();
    if (description !== undefined) dept.description = description.trim();
    if (headStaffId !== undefined) dept.headStaffId = headStaffId || null;
    if (status) dept.status = status;

    await dept.save();

    return successResponse(res, dept, 'Department updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteDepartment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const dept = await Department.findOne({ _id: id, schoolId });
    if (!dept) throw new NotFoundError('Department not found.');

    dept.status = 'INACTIVE';
    await dept.save();

    return successResponse(res, null, 'Department deactivated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
