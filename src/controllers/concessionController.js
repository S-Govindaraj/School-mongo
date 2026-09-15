const FeeConcession = require('../models/FeeConcession');
const { successResponse, errorResponse } = require('../utils/response');

const getConcessions = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { studentId, academicYearId, status, search } = req.query;

    const query = { schoolId };
    if (studentId) query.studentId = studentId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (status && status !== 'ALL') query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const concessions = await FeeConcession.find(query)
      .populate('studentId', 'firstName lastName admissionNumber studentNumber')
      .populate('academicYearId', 'name code')
      .populate('applicableFeeCategoryIds', 'name code')
      .sort({ createdAt: -1 });

    return successResponse(res, concessions, 'Fee concessions fetched successfully');
  } catch (error) {
    next(error);
  }
};

const createConcession = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const {
      studentId,
      academicYearId,
      name,
      code,
      type,
      value,
      applicableFeeCategoryIds,
      maximumAmount,
      validFrom,
      validTo,
      reason,
      status
    } = req.body;

    if (!studentId || !name || !type || value === undefined) {
      return errorResponse(res, 'Student, Name, Type and Value are required', 400, 'VALIDATION_ERROR');
    }

    const concession = await FeeConcession.create({
      schoolId,
      studentId,
      academicYearId,
      name,
      code: code ? code.toUpperCase() : `CONC-${Date.now().toString().slice(-4)}`,
      type: type || 'PERCENTAGE',
      value: Number(value),
      applicableFeeCategoryIds: applicableFeeCategoryIds || [],
      maximumAmount: maximumAmount ? Number(maximumAmount) : undefined,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validTo: validTo ? new Date(validTo) : undefined,
      reason: reason || '',
      status: status || 'APPROVED', // Default to APPROVED unless explicit approval workflow used
      createdBy: userId,
      approvedBy: status === 'APPROVED' ? userId : undefined
    });

    return successResponse(res, concession, 'Fee concession created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateConcessionStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const { status, reason } = req.body;

    const concession = await FeeConcession.findOne({ _id: id, schoolId });
    if (!concession) {
      return errorResponse(res, 'Fee concession not found', 404, 'NOT_FOUND');
    }

    if (['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(status)) {
      concession.status = status;
      if (status === 'APPROVED') {
        concession.approvedBy = userId;
      }
      if (reason) concession.reason = reason;
      await concession.save();
    }

    return successResponse(res, concession, `Concession status updated to ${status}`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConcessions,
  createConcession,
  updateConcessionStatus
};
