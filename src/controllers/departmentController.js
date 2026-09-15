/**
 * Phase 8 — Department Controller (HRMS)
 */
const Department = require('../models/Department');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

exports.list = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    const departments = await Department.find(filter).sort({ name: 1 }).lean();
    return successResponse(res, departments, 'Departments retrieved');
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const dept = await Department.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId }).lean();
    if (!dept) throw new NotFoundError('Department not found');
    return successResponse(res, dept, 'Department retrieved');
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { code, name, description, headId, parentDepartmentId } = req.body;
    if (!code || !name) throw new ValidationError('code and name are required');
    const dept = await Department.create({
      schoolId: req.schoolContext.schoolId,
      code, name, description, headId, parentDepartmentId,
      createdBy: req.user._id,
    });
    await logAudit(req, 'department_create', 'Department', dept._id, null, dept.toObject());
    return successResponse(res, dept, 'Department created', 201);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const dept = await Department.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!dept) throw new NotFoundError('Department not found');
    const before = dept.toObject();
    const allowed = ['name', 'description', 'headId', 'parentDepartmentId', 'isActive'];
    allowed.forEach((k) => { if (req.body[k] !== undefined) dept[k] = req.body[k]; });
    await dept.save();
    await logAudit(req, 'department_update', 'Department', dept._id, before, dept.toObject());
    return successResponse(res, dept, 'Department updated');
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const dept = await Department.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!dept) throw new NotFoundError('Department not found');
    dept.isActive = false;
    await dept.save();
    await logAudit(req, 'department_deactivate', 'Department', dept._id, null, null);
    return successResponse(res, null, 'Department deactivated');
  } catch (err) { next(err); }
};
