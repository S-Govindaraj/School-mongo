const Designation = require('../models/Designation');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');

const getDesignations = async (req, res, next) => {
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
      const masterDesignations = await Designation.find(filter).select('_id name code').sort({ name: 1 }).lean();
      return successResponse(res, masterDesignations, 'Designations retrieved successfully');
    }

    const designations = await Designation.find(filter).sort({ name: 1 }).lean();

    return successResponse(res, designations, 'Designations retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getDesignationById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const designation = await Designation.findOne({ _id: id, schoolId }).lean();
    if (!designation) throw new NotFoundError('Designation not found.');

    return successResponse(res, designation, 'Designation retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createDesignation = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code = '', description, status = 'ACTIVE' } = req.body;

    if (!name || !name.trim()) throw new ValidationError('Designation name is required.');

    const cleanName = name.trim();

    const existing = await Designation.findOne({ schoolId, name: new RegExp(`^${cleanName}$`, 'i') });
    if (existing) throw new ValidationError(`Designation '${cleanName}' already exists.`);

    const designation = await Designation.create({
      schoolId,
      code: code ? code.trim().toUpperCase() : '',
      name: cleanName,
      description: description ? description.trim() : '',
      status,
    });

    return successResponse(res, designation, 'Designation created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateDesignation = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const designation = await Designation.findOne({ _id: id, schoolId });
    if (!designation) throw new NotFoundError('Designation not found.');

    const { name, code, description, status } = req.body;

    if (name && name.trim() && name.trim() !== designation.name) {
      const cleanName = name.trim();
      const existing = await Designation.findOne({ schoolId, name: new RegExp(`^${cleanName}$`, 'i'), _id: { $ne: id } });
      if (existing) throw new ValidationError(`Designation '${cleanName}' already exists.`);
      designation.name = cleanName;
    }

    if (code !== undefined) designation.code = code ? code.trim().toUpperCase() : '';
    if (description !== undefined) designation.description = description.trim();
    if (status) designation.status = status;

    await designation.save();

    return successResponse(res, designation, 'Designation updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteDesignation = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const designation = await Designation.findOne({ _id: id, schoolId });
    if (!designation) throw new NotFoundError('Designation not found.');

    designation.status = 'INACTIVE';
    await designation.save();

    return successResponse(res, null, 'Designation deactivated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDesignations,
  getDesignationById,
  createDesignation,
  updateDesignation,
  deleteDesignation,
};
