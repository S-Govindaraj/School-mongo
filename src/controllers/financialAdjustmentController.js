const FinancialAdjustment = require('../models/FinancialAdjustment');
const StudentLedger = require('../models/StudentLedger');
const { generateSequenceNumber } = require('../utils/sequenceUtils');
const { successResponse, errorResponse } = require('../utils/response');

const getAdjustments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { studentId, type, status, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId };
    if (studentId) query.studentId = studentId;
    if (type && type !== 'ALL') query.type = type;
    if (status && status !== 'ALL') query.status = status;

    const [adjustments, total] = await Promise.all([
      FinancialAdjustment.find(query)
        .populate('studentId', 'firstName lastName admissionNumber studentNumber')
        .populate('requestedBy', 'name email')
        .populate('approvedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      FinancialAdjustment.countDocuments(query)
    ]);

    return successResponse(res, adjustments, 'Financial adjustments fetched successfully', 200, {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
};

const createAdjustment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const {
      studentId,
      academicYearId,
      type, // 'DEBIT' | 'CREDIT' | 'FEE_WAIVER' | 'MANUAL_CORRECTION' | 'ROUNDING_CORRECTION'
      amount,
      reason
    } = req.body;

    const numAmount = Number(amount);
    if (!studentId || !type || isNaN(numAmount) || numAmount <= 0 || !reason) {
      return errorResponse(res, 'Student, Type, valid Amount and Reason are required', 400, 'VALIDATION_ERROR');
    }

    const adjustment = await FinancialAdjustment.create({
      schoolId,
      studentId,
      academicYearId,
      type,
      amount: numAmount,
      reason,
      status: 'APPROVED',
      requestedBy: userId,
      approvedBy: userId,
      approvedAt: new Date()
    });

    // Create append-only StudentLedger entry
    const isCreditType = ['CREDIT', 'FEE_WAIVER', 'ROUNDING_CORRECTION'].includes(type);
    const lastLedger = await StudentLedger.findOne({ schoolId, studentId })
      .sort({ createdAt: -1 });

    const prevBalance = lastLedger ? lastLedger.balance : 0;
    const newBalance = isCreditType ? (prevBalance - numAmount) : (prevBalance + numAmount);

    await StudentLedger.create({
      schoolId,
      academicYearId,
      studentId,
      referenceType: 'ADJUSTMENT',
      referenceId: adjustment._id,
      transactionType: isCreditType ? 'CREDIT' : 'DEBIT',
      debit: isCreditType ? 0 : numAmount,
      credit: isCreditType ? numAmount : 0,
      balance: newBalance,
      description: `Adjustment [${type}]: ${reason}`,
      transactionDate: new Date(),
      createdBy: userId
    });

    return successResponse(res, adjustment, 'Financial adjustment applied successfully', 201);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdjustments,
  createAdjustment
};
