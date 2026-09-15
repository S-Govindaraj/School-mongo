const FeeCategory = require('../models/FeeCategory');
const { successResponse, errorResponse } = require('../utils/response');

const getFeeCategories = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { status, search } = req.query;

    const query = { schoolId };
    if (status && status !== 'ALL') query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const categories = await FeeCategory.find(query).sort({ sequence: 1, name: 1 });
    return successResponse(res, categories, 'Fee categories fetched successfully');
  } catch (error) {
    next(error);
  }
};

const createFeeCategory = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const { name, code, description, categoryType, sequence, status } = req.body;

    if (!name || !code) {
      return errorResponse(res, 'Name and Code are required', 400, 'VALIDATION_ERROR');
    }

    const existing = await FeeCategory.findOne({ schoolId, code: code.toUpperCase() });
    if (existing) {
      return errorResponse(res, 'Fee category code already exists for this school', 400, 'DUPLICATE_CODE');
    }

    const category = await FeeCategory.create({
      schoolId,
      name,
      code: code.toUpperCase(),
      description,
      categoryType: categoryType || 'TUITION',
      sequence: sequence || 1,
      status: status || 'ACTIVE',
      createdBy: userId,
      updatedBy: userId
    });

    return successResponse(res, category, 'Fee category created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateFeeCategory = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;

    const category = await FeeCategory.findOne({ _id: id, schoolId });
    if (!category) {
      return errorResponse(res, 'Fee category not found', 404, 'NOT_FOUND');
    }

    const { name, description, categoryType, sequence, status } = req.body;
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (categoryType) category.categoryType = categoryType;
    if (sequence !== undefined) category.sequence = sequence;
    if (status) category.status = status;
    category.updatedBy = userId;

    await category.save();
    return successResponse(res, category, 'Fee category updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteFeeCategory = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { id } = req.params;

    const category = await FeeCategory.findOne({ _id: id, schoolId });
    if (!category) {
      return errorResponse(res, 'Fee category not found', 404, 'NOT_FOUND');
    }

    category.status = 'INACTIVE';
    await category.save();

    return successResponse(res, category, 'Fee category deactivated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFeeCategories,
  createFeeCategory,
  updateFeeCategory,
  deleteFeeCategory
};
