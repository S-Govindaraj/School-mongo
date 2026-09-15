const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const Invoice = require('../models/Invoice');
const Receipt = require('../models/Receipt');
const StudentLedger = require('../models/StudentLedger');
const { generateSequenceNumber } = require('../utils/sequenceUtils');
const { successResponse, errorResponse } = require('../utils/response');

const getPayments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const {
      studentId,
      status,
      paymentMethod,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId };
    if (studentId) query.studentId = studentId;
    if (status && status !== 'ALL') query.status = status;
    if (paymentMethod && paymentMethod !== 'ALL') query.paymentMethod = paymentMethod;

    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) query.paymentDate.$gte = new Date(startDate);
      if (endDate) query.paymentDate.$lte = new Date(endDate);
    }

    if (search && search.trim()) {
      const s = String(search).trim();
      const Student = require('../models/Student');
      const matchingStudents = await Student.find({
        schoolId,
        $or: [
          { firstName: { $regex: s, $options: 'i' } },
          { lastName: { $regex: s, $options: 'i' } },
          { admissionNumber: { $regex: s, $options: 'i' } },
          { studentNumber: { $regex: s, $options: 'i' } }
        ]
      }).select('_id');

      query.$or = [
        { paymentNumber: { $regex: s, $options: 'i' } },
        { referenceNumber: { $regex: s, $options: 'i' } },
        { studentId: { $in: matchingStudents.map(st => st._id) } }
      ];
    }

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate('studentId', 'firstName lastName admissionNumber studentNumber phone email')
        .populate('receivedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Payment.countDocuments(query)
    ]);

    return successResponse(res, payments, 'Payments fetched successfully', 200, {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
};

const getPaymentById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { id } = req.params;

    const payment = await Payment.findOne({ _id: id, schoolId })
      .populate('studentId', 'firstName lastName admissionNumber studentNumber phone email')
      .populate('receivedBy', 'name email');

    if (!payment) {
      return errorResponse(res, 'Payment not found', 404, 'NOT_FOUND');
    }

    const allocations = await PaymentAllocation.find({ schoolId, paymentId: id })
      .populate('invoiceId', 'invoiceNumber billingPeriod totalAmount paidAmount balanceAmount status');

    const receipt = await Receipt.findOne({ schoolId, paymentId: id });

    const result = payment.toObject();
    result.allocations = allocations;
    result.receipt = receipt;

    return successResponse(res, result, 'Payment details fetched successfully');
  } catch (error) {
    next(error);
  }
};

const collectPayment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    // Idempotency check header or body
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || `IDEM-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Rule 12: Check idempotency
    const existingPayment = await Payment.findOne({ schoolId, idempotencyKey });
    if (existingPayment) {
      const allocations = await PaymentAllocation.find({ schoolId, paymentId: existingPayment._id });
      const receipt = await Receipt.findOne({ schoolId, paymentId: existingPayment._id });
      return successResponse(res, {
        payment: existingPayment,
        allocations,
        receipt,
        idempotent: true
      }, 'Payment already processed (idempotent response)');
    }

    const {
      studentId,
      amount,
      paymentMethod = 'CASH',
      referenceNumber = '',
      notes = '',
      allocations // Array of { invoiceId, amount } OR undefined (auto-allocation)
    } = req.body;

    const numAmount = Number(amount);
    if (!studentId || isNaN(numAmount) || numAmount <= 0) {
      return errorResponse(res, 'Student ID and valid amount are required', 400, 'VALIDATION_ERROR');
    }

    const paymentNumber = await generateSequenceNumber(schoolId, 'PAYMENT');

    // Create Payment
    const payment = await Payment.create({
      schoolId,
      studentId,
      paymentNumber,
      paymentDate: new Date(),
      amount: numAmount,
      currency: 'INR',
      paymentMethod,
      referenceNumber,
      status: 'SUCCESS',
      receivedBy: userId,
      notes,
      idempotencyKey
    });

    // Handle allocation
    let remainingPayment = numAmount;
    const createdAllocations = [];
    const allocatedInvoiceReceiptDetails = [];

    let targetInvoices = [];

    if (Array.isArray(allocations) && allocations.length > 0) {
      const invIds = allocations.map(a => a.invoiceId);
      const invs = await Invoice.find({ schoolId, _id: { $in: invIds } });

      for (const alloc of allocations) {
        const inv = invs.find(i => String(i._id) === String(alloc.invoiceId));
        if (inv) {
          targetInvoices.push({ invoice: inv, allocAmount: Number(alloc.amount) });
        }
      }
    } else {
      // Auto-allocation: OLDEST_FIRST
      const openInvoices = await Invoice.find({
        schoolId,
        studentId,
        status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        balanceAmount: { $gt: 0 }
      }).sort({ dueDate: 1, createdAt: 1 });

      for (const inv of openInvoices) {
        if (remainingPayment <= 0) break;
        const allocAmount = Math.min(remainingPayment, inv.balanceAmount);
        targetInvoices.push({ invoice: inv, allocAmount });
        remainingPayment -= allocAmount;
      }
    }

    for (const { invoice, allocAmount } of targetInvoices) {
      if (allocAmount <= 0) continue;

      const allocation = await PaymentAllocation.create({
        schoolId,
        paymentId: payment._id,
        invoiceId: invoice._id,
        studentId,
        allocatedAmount: allocAmount,
        allocationDate: new Date(),
        allocatedBy: userId
      });

      createdAllocations.push(allocation);

      // Update Invoice
      invoice.paidAmount += allocAmount;
      invoice.balanceAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);

      if (invoice.balanceAmount === 0) {
        invoice.status = 'PAID';
      } else {
        invoice.status = 'PARTIALLY_PAID';
      }
      invoice.updatedBy = userId;
      await invoice.save();

      allocatedInvoiceReceiptDetails.push({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        allocatedAmount: allocAmount
      });
    }

    // Ledger Entry (CREDIT)
    const lastLedger = await StudentLedger.findOne({ schoolId, studentId })
      .sort({ createdAt: -1 });

    const prevBalance = lastLedger ? lastLedger.balance : 0;
    const newBalance = prevBalance - numAmount; // Payment reduces balance owed (can be negative for credit balance)

    await StudentLedger.create({
      schoolId,
      studentId,
      referenceType: 'PAYMENT',
      referenceId: payment._id,
      transactionType: 'CREDIT',
      debit: 0,
      credit: numAmount,
      balance: newBalance,
      description: `Payment ${payment.paymentNumber} received via ${paymentMethod}`,
      transactionDate: new Date(),
      createdBy: userId
    });

    // Auto-generate Receipt
    const receiptNumber = await generateSequenceNumber(schoolId, 'RECEIPT');
    const receipt = await Receipt.create({
      schoolId,
      studentId,
      paymentId: payment._id,
      receiptNumber,
      receiptDate: new Date(),
      amount: numAmount,
      paymentMethod,
      referenceNumber,
      allocatedInvoices: allocatedInvoiceReceiptDetails,
      status: 'ISSUED',
      generatedAt: new Date(),
      generatedBy: userId
    });

    return successResponse(res, {
      payment,
      allocations: createdAllocations,
      receipt
    }, 'Payment collected and receipt generated successfully', 201);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPayments,
  getPaymentById,
  collectPayment
};
