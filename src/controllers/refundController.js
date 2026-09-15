const Refund = require('../models/Refund');
const Payment = require('../models/Payment');
const StudentLedger = require('../models/StudentLedger');
const { generateSequenceNumber } = require('../utils/sequenceUtils');
const { successResponse, errorResponse } = require('../utils/response');

const getRefunds = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { studentId, status, search, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId };
    if (studentId) query.studentId = studentId;
    if (status && status !== 'ALL') query.status = status;

    if (search && search.trim()) {
      query.refundNumber = { $regex: search.trim(), $options: 'i' };
    }

    const [refunds, total] = await Promise.all([
      Refund.find(query)
        .populate('studentId', 'firstName lastName admissionNumber studentNumber')
        .populate('paymentId', 'paymentNumber amount paymentDate')
        .populate('requestedBy', 'name email')
        .populate('approvedBy', 'name email')
        .populate('processedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Refund.countDocuments(query)
    ]);

    return successResponse(res, refunds, 'Refunds fetched successfully', 200, {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
};

const createRefund = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const { paymentId, refundAmount, refundMethod = 'BANK_TRANSFER', reason } = req.body;

    const amountNum = Number(refundAmount);
    if (!paymentId || isNaN(amountNum) || amountNum <= 0 || !reason) {
      return errorResponse(res, 'Payment, valid Refund Amount, and Reason are required', 400, 'VALIDATION_ERROR');
    }

    const payment = await Payment.findOne({ _id: paymentId, schoolId });
    if (!payment) {
      return errorResponse(res, 'Payment not found', 404, 'NOT_FOUND');
    }

    if (payment.status !== 'SUCCESS') {
      return errorResponse(res, 'Cannot refund non-successful payment', 400, 'INVALID_PAYMENT_STATUS');
    }

    // Check existing refunds for payment
    const existingRefunds = await Refund.find({ schoolId, paymentId, status: { $in: ['REQUESTED', 'APPROVED', 'PROCESSED'] } });
    const totalRefunded = existingRefunds.reduce((sum, r) => sum + r.refundAmount, 0);

    if (totalRefunded + amountNum > payment.amount) {
      return errorResponse(
        res,
        `Refund amount exceeds remaining payment amount. Max refundable: ₹${payment.amount - totalRefunded}`,
        400,
        'EXCESSIVE_REFUND'
      );
    }

    const refundNumber = await generateSequenceNumber(schoolId, 'REFUND');

    const refund = await Refund.create({
      schoolId,
      paymentId,
      studentId: payment.studentId,
      refundNumber,
      refundAmount: amountNum,
      refundDate: new Date(),
      refundMethod,
      reason,
      status: 'REQUESTED',
      requestedBy: userId
    });

    return successResponse(res, refund, 'Refund request submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateRefundStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const { action } = req.body; // 'APPROVE' | 'REJECT' | 'PROCESS' | 'CANCEL'

    const refund = await Refund.findOne({ _id: id, schoolId });
    if (!refund) {
      return errorResponse(res, 'Refund record not found', 404, 'NOT_FOUND');
    }

    if (action === 'APPROVE') {
      if (refund.status !== 'REQUESTED') {
        return errorResponse(res, 'Only REQUESTED refunds can be approved', 400, 'INVALID_STATUS');
      }
      refund.status = 'APPROVED';
      refund.approvedBy = userId;
      refund.approvedAt = new Date();
    } else if (action === 'REJECT') {
      if (refund.status !== 'REQUESTED') {
        return errorResponse(res, 'Only REQUESTED refunds can be rejected', 400, 'INVALID_STATUS');
      }
      refund.status = 'REJECTED';
    } else if (action === 'PROCESS') {
      if (refund.status !== 'APPROVED') {
        return errorResponse(res, 'Only APPROVED refunds can be processed', 400, 'INVALID_STATUS');
      }
      refund.status = 'PROCESSED';
      refund.processedBy = userId;
      refund.processedAt = new Date();

      // Update Ledger entry (DEBIT) - money refunded to student increases student balance owed
      const lastLedger = await StudentLedger.findOne({ schoolId, studentId: refund.studentId })
        .sort({ createdAt: -1 });

      const prevBalance = lastLedger ? lastLedger.balance : 0;
      const newBalance = prevBalance + refund.refundAmount;

      await StudentLedger.create({
        schoolId,
        studentId: refund.studentId,
        referenceType: 'REFUND',
        referenceId: refund._id,
        transactionType: 'DEBIT',
        debit: refund.refundAmount,
        credit: 0,
        balance: newBalance,
        description: `Refund ${refund.refundNumber} processed (${refund.reason})`,
        transactionDate: new Date(),
        createdBy: userId
      });

      // Update payment status
      const payment = await Payment.findById(refund.paymentId);
      if (payment) {
        if (refund.refundAmount >= payment.amount) {
          payment.status = 'REFUNDED';
        } else {
          payment.status = 'PARTIALLY_REFUNDED';
        }
        await payment.save();
      }
    } else if (action === 'CANCEL') {
      refund.status = 'CANCELLED';
    } else {
      return errorResponse(res, 'Invalid refund action', 400, 'INVALID_ACTION');
    }

    await refund.save();
    return successResponse(res, refund, `Refund status updated to ${refund.status}`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRefunds,
  createRefund,
  updateRefundStatus
};
