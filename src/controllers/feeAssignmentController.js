const StudentFeeAssignment = require('../models/StudentFeeAssignment');
const FeeStructure = require('../models/FeeStructure');
const FeeStructureItem = require('../models/FeeStructureItem');
const Enrollment = require('../models/Enrollment');
const { successResponse, errorResponse } = require('../utils/response');

const getFeeAssignments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { studentId, academicYearId, gradeId, sectionId, feeStructureId, status, page = 1, limit = 50 } = req.query;

    const query = { schoolId };
    if (studentId) query.studentId = studentId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (feeStructureId) query.feeStructureId = feeStructureId;
    if (status && status !== 'ALL') query.status = status;

    if (gradeId || sectionId) {
      const enrollQuery = { schoolId, isCurrent: true };
      if (gradeId) enrollQuery.gradeId = gradeId;
      if (sectionId) enrollQuery.sectionId = sectionId;
      const enrolls = await Enrollment.find(enrollQuery).select('studentId');
      query.studentId = { $in: enrolls.map(e => e.studentId) };
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [assignments, total] = await Promise.all([
      StudentFeeAssignment.find(query)
        .populate('studentId', 'firstName lastName admissionNumber studentNumber')
        .populate('enrollmentId', 'gradeId sectionId')
        .populate('feeStructureId', 'name code billingFrequency')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      StudentFeeAssignment.countDocuments(query)
    ]);

    return successResponse(res, assignments, 'Fee assignments fetched successfully', 200, {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
};

const assignFeeToStudents = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const {
      academicYearId,
      feeStructureId,
      studentIds, // Array of student IDs or single ID
      gradeId,
      sectionId,
      effectiveFrom,
      effectiveTo
    } = req.body;

    if (!academicYearId || !feeStructureId) {
      return errorResponse(res, 'Academic Year and Fee Structure are required', 400, 'VALIDATION_ERROR');
    }

    const structure = await FeeStructure.findOne({ _id: feeStructureId, schoolId });
    if (!structure) {
      return errorResponse(res, 'Fee structure not found', 404, 'NOT_FOUND');
    }

    // Fetch items to snapshot
    const structureItems = await FeeStructureItem.find({ schoolId, feeStructureId, status: 'ACTIVE' })
      .populate('feeCategoryId', 'name code');

    const snapshottedItems = structureItems.map(item => ({
      feeCategoryId: item.feeCategoryId._id || item.feeCategoryId,
      feeStructureItemId: item._id,
      name: item.name,
      amount: item.amount, // Snapshot current amount
      frequency: item.frequency,
      isMandatory: item.isMandatory,
      fineEnabled: item.fineEnabled,
      discountAllowed: item.discountAllowed,
      concessionAllowed: item.concessionAllowed
    }));

    let targetStudentIds = [];

    if (Array.isArray(studentIds) && studentIds.length > 0) {
      targetStudentIds = studentIds;
    } else if (gradeId || sectionId) {
      const enrollQuery = { schoolId, academicYearId, isCurrent: true };
      if (gradeId) enrollQuery.gradeId = gradeId;
      if (sectionId) enrollQuery.sectionId = sectionId;

      const enrollments = await Enrollment.find(enrollQuery).select('studentId _id');
      targetStudentIds = enrollments.map(e => String(e.studentId));
    }

    if (targetStudentIds.length === 0) {
      return errorResponse(res, 'No target students selected or found', 400, 'VALIDATION_ERROR');
    }

    const assignedResults = [];

    for (const sId of targetStudentIds) {
      const enrollment = await Enrollment.findOne({ schoolId, studentId: sId, isCurrent: true });

      const assignment = await StudentFeeAssignment.findOneAndUpdate(
        { schoolId, academicYearId, studentId: sId, feeStructureId },
        {
          enrollmentId: enrollment?._id,
          assignedItems: snapshottedItems,
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
          effectiveTo: effectiveTo ? new Date(effectiveTo) : undefined,
          status: 'ACTIVE',
          assignedBy: userId
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      assignedResults.push(assignment);
    }

    return successResponse(res, { assignedCount: assignedResults.length, assignments: assignedResults }, 'Student fee assignment completed successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateFeeAssignment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { id } = req.params;

    const assignment = await StudentFeeAssignment.findOne({ _id: id, schoolId });
    if (!assignment) {
      return errorResponse(res, 'Fee assignment not found', 404, 'NOT_FOUND');
    }

    const { status, assignedItems, effectiveFrom, effectiveTo } = req.body;
    if (status) assignment.status = status;
    if (Array.isArray(assignedItems)) assignment.assignedItems = assignedItems;
    if (effectiveFrom) assignment.effectiveFrom = new Date(effectiveFrom);
    if (effectiveTo) assignment.effectiveTo = new Date(effectiveTo);

    await assignment.save();
    return successResponse(res, assignment, 'Fee assignment updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFeeAssignments,
  assignFeeToStudents,
  updateFeeAssignment
};
