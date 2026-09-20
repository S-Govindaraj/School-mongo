const FeeStructure = require('../models/FeeStructure');
const FeeStructureItem = require('../models/FeeStructureItem');
const { successResponse, errorResponse } = require('../utils/response');

const getFeeStructures = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { academicYearId, gradeId, status } = req.query;

    const query = { schoolId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (gradeId) query.gradeIds = gradeId;
    if (status && status !== 'ALL') query.status = status;

    // Single aggregation pipeline — fetches structures + embedded items in one round-trip
    const result = await FeeStructure.aggregate([
      { $match: query },
      { $lookup: {
          from: 'feestructureitems',
          let: { structureId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$feeStructureId', '$$structureId'] } } },
            { $lookup: {
                from: 'feecategories',
                localField: 'feeCategoryId',
                foreignField: '_id',
                as: 'feeCategoryId',
                pipeline: [{ $project: { name: 1, code: 1, categoryType: 1 } }],
            }},
            { $unwind: { path: '$feeCategoryId', preserveNullAndEmptyArrays: true } },
          ],
          as: 'items',
      }},
      // Populate academicYearId, gradeIds, sectionIds
      { $lookup: { from: 'academicyears',  localField: 'academicYearId', foreignField: '_id', as: 'academicYearId',
          pipeline: [{ $project: { name: 1, code: 1 } }] }},
      { $unwind: { path: '$academicYearId', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'grades', localField: 'gradeIds', foreignField: '_id', as: 'gradeIds',
          pipeline: [{ $project: { name: 1, code: 1 } }] }},
      { $lookup: { from: 'sections', localField: 'sectionIds', foreignField: '_id', as: 'sectionIds',
          pipeline: [{ $project: { name: 1, code: 1 } }] }},
      { $sort: { createdAt: -1 } },
    ]);

    return successResponse(res, result, 'Fee structures fetched successfully');
  } catch (error) {
    next(error);
  }
};

const getFeeStructureById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { id } = req.params;

    // Fetch structure + items in parallel (2 queries → 1 round-trip)
    const [structure, items] = await Promise.all([
      FeeStructure.findOne({ _id: id, schoolId })
        .populate('academicYearId', 'name code')
        .populate('gradeIds', 'name code')
        .populate('sectionIds', 'name code'),
      FeeStructureItem.find({ schoolId, feeStructureId: id })
        .populate('feeCategoryId', 'name code categoryType'),
    ]);

    if (!structure) {
      return errorResponse(res, 'Fee structure not found', 404, 'NOT_FOUND');
    }

    const result = structure.toObject();
    result.items = items;

    return successResponse(res, result, 'Fee structure detail fetched successfully');
  } catch (error) {
    next(error);
  }
};

const createFeeStructure = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const {
      academicYearId,
      name,
      code,
      description,
      applicableTo,
      gradeIds,
      sectionIds,
      effectiveFrom,
      effectiveTo,
      billingFrequency,
      status,
      items // Array of items: { feeCategoryId, name, amount, frequency, isMandatory, isOptional, sequence, applicableMonths, fineEnabled, discountAllowed, concessionAllowed }
    } = req.body;

    if (!academicYearId || !name || !code) {
      return errorResponse(res, 'Academic Year, Name, and Code are required', 400, 'VALIDATION_ERROR');
    }

    const existing = await FeeStructure.findOne({ schoolId, academicYearId, code: code.toUpperCase() });
    if (existing) {
      return errorResponse(res, 'Fee structure code already exists for this academic year', 400, 'DUPLICATE_CODE');
    }

    const structure = await FeeStructure.create({
      schoolId,
      academicYearId,
      name,
      code: code.toUpperCase(),
      description,
      applicableTo: applicableTo || 'ALL_STUDENTS',
      gradeIds: gradeIds || [],
      sectionIds: sectionIds || [],
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : undefined,
      billingFrequency: billingFrequency || 'MONTHLY',
      status: status || 'ACTIVE',
      createdBy: userId,
      updatedBy: userId
    });

    let createdItems = [];
    if (Array.isArray(items) && items.length > 0) {
      const itemsToCreate = items.map((item, idx) => ({
        schoolId,
        feeStructureId: structure._id,
        feeCategoryId: item.feeCategoryId,
        name: item.name || 'Fee Item',
        amount: Number(item.amount) || 0,
        frequency: item.frequency || billingFrequency || 'MONTHLY',
        isMandatory: item.isMandatory !== undefined ? item.isMandatory : true,
        isOptional: item.isOptional || false,
        sequence: item.sequence || idx + 1,
        applicableMonths: item.applicableMonths || [],
        fineEnabled: item.fineEnabled !== undefined ? item.fineEnabled : true,
        discountAllowed: item.discountAllowed !== undefined ? item.discountAllowed : true,
        concessionAllowed: item.concessionAllowed !== undefined ? item.concessionAllowed : true,
        status: 'ACTIVE'
      }));
      createdItems = await FeeStructureItem.insertMany(itemsToCreate);
    }

    const result = structure.toObject();
    result.items = createdItems;

    return successResponse(res, result, 'Fee structure created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateFeeStructure = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;

    const structure = await FeeStructure.findOne({ _id: id, schoolId });
    if (!structure) {
      return errorResponse(res, 'Fee structure not found', 404, 'NOT_FOUND');
    }

    const {
      name,
      description,
      applicableTo,
      gradeIds,
      sectionIds,
      effectiveFrom,
      effectiveTo,
      billingFrequency,
      status,
      items
    } = req.body;

    if (name) structure.name = name;
    if (description !== undefined) structure.description = description;
    if (applicableTo) structure.applicableTo = applicableTo;
    if (gradeIds) structure.gradeIds = gradeIds;
    if (sectionIds) structure.sectionIds = sectionIds;
    if (effectiveFrom) structure.effectiveFrom = new Date(effectiveFrom);
    if (effectiveTo) structure.effectiveTo = new Date(effectiveTo);
    if (billingFrequency) structure.billingFrequency = billingFrequency;
    if (status) structure.status = status;
    structure.updatedBy = userId;

    await structure.save();

    if (Array.isArray(items)) {
      // Refresh items: delete old + insert new, then use insertMany result directly
      await FeeStructureItem.deleteMany({ schoolId, feeStructureId: id });
      const itemsToCreate = items.map((item, idx) => ({
        schoolId,
        feeStructureId: id,
        feeCategoryId: item.feeCategoryId,
        name: item.name || 'Fee Item',
        amount: Number(item.amount) || 0,
        frequency: item.frequency || structure.billingFrequency || 'MONTHLY',
        isMandatory: item.isMandatory !== undefined ? item.isMandatory : true,
        isOptional: item.isOptional || false,
        sequence: item.sequence || idx + 1,
        applicableMonths: item.applicableMonths || [],
        fineEnabled: item.fineEnabled !== undefined ? item.fineEnabled : true,
        discountAllowed: item.discountAllowed !== undefined ? item.discountAllowed : true,
        concessionAllowed: item.concessionAllowed !== undefined ? item.concessionAllowed : true,
        status: 'ACTIVE'
      }));
      // insertMany returns the created docs — no extra re-fetch needed
      const updatedItems = await FeeStructureItem.insertMany(itemsToCreate);

      const result = structure.toObject();
      result.items = updatedItems;
      return successResponse(res, result, 'Fee structure updated successfully');
    }

    const result = structure.toObject();
    result.items = [];
    return successResponse(res, result, 'Fee structure updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteFeeStructure = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { id } = req.params;

    const structure = await FeeStructure.findOne({ _id: id, schoolId });
    if (!structure) {
      return errorResponse(res, 'Fee structure not found', 404, 'NOT_FOUND');
    }

    structure.status = 'INACTIVE';
    await structure.save();

    return successResponse(res, structure, 'Fee structure deactivated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFeeStructures,
  getFeeStructureById,
  createFeeStructure,
  updateFeeStructure,
  deleteFeeStructure
};
