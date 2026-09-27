const Qualification = require('../models/Qualification');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');

const getQualifications = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, search, level } = req.query;

    const filter = {
      $or: [{ schoolId }, { schoolId: null }],
    };

    if (status && status !== 'ALL') {
      filter.status = status;
    }
    if (level && level !== 'ALL') {
      filter.level = level;
    }
    if (search && search.trim()) {
      filter.$and = [
        {
          $or: [
            { name: { $regex: search.trim(), $options: 'i' } },
            { code: { $regex: search.trim(), $options: 'i' } },
          ],
        },
      ];
    }

    const qualifications = await Qualification.find(filter).sort({ name: 1 }).lean();
    return successResponse(res, qualifications, 'Qualifications retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getQualificationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const qual = await Qualification.findById(id).lean();
    if (!qual) throw new NotFoundError('Qualification not found.');
    return successResponse(res, qual, 'Qualification retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createQualification = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code, level, description, status = 'ACTIVE' } = req.body;

    if (!name || !name.trim()) throw new ValidationError('Qualification name is required.');

    const cleanName = name.trim();
    const cleanCode = (code || '').trim().toUpperCase();

    const existing = await Qualification.findOne({
      $or: [{ schoolId }, { schoolId: null }],
      name: { $regex: `^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (existing) throw new ValidationError(`Qualification '${cleanName}' already exists.`);

    const qual = await Qualification.create({
      schoolId,
      code: cleanCode,
      name: cleanName,
      level: level || 'POST_GRADUATE',
      description: description ? description.trim() : '',
      status,
    });

    return successResponse(res, qual, 'Qualification created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateQualification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const qual = await Qualification.findById(id);
    if (!qual) throw new NotFoundError('Qualification not found.');

    const { name, code, level, description, status } = req.body;

    if (name && name.trim()) qual.name = name.trim();
    if (code !== undefined) qual.code = (code || '').trim().toUpperCase();
    if (level) qual.level = level;
    if (description !== undefined) qual.description = description.trim();
    if (status) qual.status = status;

    await qual.save();

    return successResponse(res, qual, 'Qualification updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getQualifications,
  getQualificationById,
  createQualification,
  updateQualification,
};
