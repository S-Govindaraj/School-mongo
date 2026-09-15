/**
 * Phase 8 — Designation Controller (HRMS)
 */
const Designation = require('../models/Designation');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

exports.list = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    const items = await Designation.find(filter).populate('departmentId', 'name code').sort({ name: 1 }).lean();
    return successResponse(res, items, 'Designations retrieved');
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const item = await Designation.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId })
      .populate('departmentId', 'name code').lean();
    if (!item) throw new NotFoundError('Designation not found');
    return successResponse(res, item, 'Designation retrieved');
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { code, name, departmentId, level, description } = req.body;
    if (!code || !name) throw new ValidationError('code and name are required');
    const item = await Designation.create({ schoolId: req.schoolContext.schoolId, code, name, departmentId, level, description });
    await logAudit(req, 'designation_create', 'Designation', item._id, null, item.toObject());
    return successResponse(res, item, 'Designation created', 201);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const item = await Designation.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!item) throw new NotFoundError('Designation not found');
    const before = item.toObject();
    const allowed = ['name', 'departmentId', 'level', 'description', 'isActive'];
    allowed.forEach((k) => { if (req.body[k] !== undefined) item[k] = req.body[k]; });
    await item.save();
    await logAudit(req, 'designation_update', 'Designation', item._id, before, item.toObject());
    return successResponse(res, item, 'Designation updated');
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const item = await Designation.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!item) throw new NotFoundError('Designation not found');
    item.isActive = false;
    await item.save();
    await logAudit(req, 'designation_deactivate', 'Designation', item._id, null, null);
    return successResponse(res, null, 'Designation deactivated');
  } catch (err) { next(err); }
};
