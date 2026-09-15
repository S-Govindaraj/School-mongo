const FeeFineRule = require('../models/FeeFineRule');
const { successResponse, errorResponse } = require('../utils/response');

const getFineRules = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { status } = req.query;

    const query = { schoolId };
    if (status && status !== 'ALL') query.status = status;

    const fineRules = await FeeFineRule.find(query)
      .populate('applicableFeeCategoryIds', 'name code')
      .sort({ createdAt: -1 });

    return successResponse(res, fineRules, 'Fee fine rules fetched successfully');
  } catch (error) {
    next(error);
  }
};

const createFineRule = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const {
      name,
      code,
      calculationType,
      value,
      graceDays,
      maximumAmount,
      applicableFeeCategoryIds,
      status
    } = req.body;

    if (!name || !code || !calculationType || value === undefined) {
      return errorResponse(res, 'Name, Code, Calculation Type and Value are required', 400, 'VALIDATION_ERROR');
    }

    const existing = await FeeFineRule.findOne({ schoolId, code: code.toUpperCase() });
    if (existing) {
      return errorResponse(res, 'Fine rule code already exists', 400, 'DUPLICATE_CODE');
    }

    const fineRule = await FeeFineRule.create({
      schoolId,
      name,
      code: code.toUpperCase(),
      calculationType: calculationType || 'FIXED',
      value: Number(value),
      graceDays: graceDays ? Number(graceDays) : 0,
      maximumAmount: maximumAmount ? Number(maximumAmount) : undefined,
      applicableFeeCategoryIds: applicableFeeCategoryIds || [],
      status: status || 'ACTIVE'
    });

    return successResponse(res, fineRule, 'Fine rule created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateFineRule = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { id } = req.params;

    const fineRule = await FeeFineRule.findOne({ _id: id, schoolId });
    if (!fineRule) {
      return errorResponse(res, 'Fine rule not found', 404, 'NOT_FOUND');
    }

    const { name, calculationType, value, graceDays, maximumAmount, applicableFeeCategoryIds, status } = req.body;
    if (name) fineRule.name = name;
    if (calculationType) fineRule.calculationType = calculationType;
    if (value !== undefined) fineRule.value = Number(value);
    if (graceDays !== undefined) fineRule.graceDays = Number(graceDays);
    if (maximumAmount !== undefined) fineRule.maximumAmount = Number(maximumAmount);
    if (applicableFeeCategoryIds) fineRule.applicableFeeCategoryIds = applicableFeeCategoryIds;
    if (status) fineRule.status = status;

    await fineRule.save();
    return successResponse(res, fineRule, 'Fine rule updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteFineRule = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { id } = req.params;

    const fineRule = await FeeFineRule.findOne({ _id: id, schoolId });
    if (!fineRule) {
      return errorResponse(res, 'Fine rule not found', 404, 'NOT_FOUND');
    }

    fineRule.status = 'INACTIVE';
    await fineRule.save();

    return successResponse(res, fineRule, 'Fine rule deactivated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFineRules,
  createFineRule,
  updateFineRule,
  deleteFineRule
};
