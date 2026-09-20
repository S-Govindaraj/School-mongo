const Invoice = require('../models/Invoice');
const InvoiceItem = require('../models/InvoiceItem');
const StudentFeeAssignment = require('../models/StudentFeeAssignment');
const FeeConcession = require('../models/FeeConcession');
const FeeFineRule = require('../models/FeeFineRule');
const Enrollment = require('../models/Enrollment');
const StudentLedger = require('../models/StudentLedger');
const PaymentAllocation = require('../models/PaymentAllocation');
const Payment = require('../models/Payment');
const { generateSequenceNumber } = require('../utils/sequenceUtils');
const { successResponse, errorResponse } = require('../utils/response');

const getInvoices = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const {
      search = '',
      status = '',
      academicYearId = '',
      gradeId = '',
      sectionId = '',
      billingPeriod = '',
      startDate = '',
      endDate = '',
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId };
    if (status && status !== 'ALL') query.status = status;
    if (academicYearId) query.academicYearId = academicYearId;
    if (billingPeriod) query.billingPeriod = billingPeriod;

    if (startDate || endDate) {
      query.dueDate = {};
      if (startDate) query.dueDate.$gte = new Date(startDate);
      if (endDate) query.dueDate.$lte = new Date(endDate);
    }

    if (gradeId || sectionId || search.trim()) {
      const studentQuery = { schoolId };
      if (search.trim()) {
        const s = String(search).trim();
        studentQuery.$or = [
          { firstName: { $regex: s, $options: 'i' } },
          { lastName: { $regex: s, $options: 'i' } },
          { admissionNumber: { $regex: s, $options: 'i' } },
          { studentNumber: { $regex: s, $options: 'i' } }
        ];
      }

      if (gradeId || sectionId) {
        const enrollQuery = { schoolId, isCurrent: true };
        if (gradeId) enrollQuery.gradeId = gradeId;
        if (sectionId) enrollQuery.sectionId = sectionId;
        const matchingEnrollments = await Enrollment.find(enrollQuery).select('studentId');
        const studentIdsFromEnroll = matchingEnrollments.map(e => e.studentId);
        studentQuery._id = { $in: studentIdsFromEnroll };
      }

      const Student = require('../models/Student');
      const matchingStudents = await Student.find(studentQuery).select('_id');
      const matchedIds = matchingStudents.map(s => s._id);

      if (search.trim()) {
        query.$or = [
          { invoiceNumber: { $regex: search.trim(), $options: 'i' } },
          { studentId: { $in: matchedIds } }
        ];
      } else {
        query.studentId = { $in: matchedIds };
      }
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('studentId', 'firstName lastName admissionNumber studentNumber phone email')
        .populate('enrollmentId', 'gradeId sectionId')
        .populate('academicYearId', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Invoice.countDocuments(query)
    ]);

    return successResponse(res, invoices, 'Invoices fetched successfully', 200, {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
};

const getInvoiceById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { id } = req.params;

    // Fetch invoice + items + allocations in parallel (3 queries → 1 round-trip)
    const [invoice, items, allocations] = await Promise.all([
      Invoice.findOne({ _id: id, schoolId })
        .populate('studentId', 'firstName lastName admissionNumber studentNumber phone email')
        .populate('enrollmentId', 'gradeId sectionId')
        .populate('academicYearId', 'name code'),
      InvoiceItem.find({ schoolId, invoiceId: id })
        .populate('feeCategoryId', 'name code'),
      PaymentAllocation.find({ schoolId, invoiceId: id })
        .populate({ path: 'paymentId', select: 'paymentNumber paymentDate paymentMethod referenceNumber status' }),
    ]);

    if (!invoice) {
      return errorResponse(res, 'Invoice not found', 404, 'NOT_FOUND');
    }

    const result = invoice.toObject();
    result.items = items;
    result.allocations = allocations;

    return successResponse(res, result, 'Invoice detail fetched successfully');
  } catch (error) {
    next(error);
  }
};

const generateBulkInvoices = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const {
      academicYearId,
      feeStructureId,
      gradeId,
      sectionId,
      billingPeriod, // e.g., '2026-09'
      dueDate,
      studentIds // Optional array of specific student IDs
    } = req.body;

    if (!academicYearId || !billingPeriod || !dueDate) {
      return errorResponse(res, 'Academic Year, Billing Period, and Due Date are required', 400, 'VALIDATION_ERROR');
    }

    // Find assignments matching query
    const assignQuery = { schoolId, academicYearId, status: 'ACTIVE' };
    if (feeStructureId) assignQuery.feeStructureId = feeStructureId;

    if (Array.isArray(studentIds) && studentIds.length > 0) {
      assignQuery.studentId = { $in: studentIds };
    } else if (gradeId || sectionId) {
      const enrollQuery = { schoolId, isCurrent: true };
      if (gradeId) enrollQuery.gradeId = gradeId;
      if (sectionId) enrollQuery.sectionId = sectionId;
      const matchingEnrollments = await Enrollment.find(enrollQuery).select('studentId');
      assignQuery.studentId = { $in: matchingEnrollments.map(e => e.studentId) };
    }

    const assignments = await StudentFeeAssignment.find(assignQuery);
    if (assignments.length === 0) {
      return errorResponse(res, 'No active student fee assignments found for the selection', 400, 'NO_ASSIGNMENTS');
    }

    // Pre-fetch all data needed inside the loop in parallel (eliminates N+1 per student)
    const allStudentIds = assignments.map(a => a.studentId);
    const [existingInvoicesArr, allConcessionsArr, lastLedgersArr] = await Promise.all([
      Invoice.find({ schoolId, studentId: { $in: allStudentIds }, billingPeriod, status: { $ne: 'CANCELLED' } })
        .select('studentId').lean(),
      FeeConcession.find({ schoolId, studentId: { $in: allStudentIds }, status: 'APPROVED' }).lean(),
      StudentLedger.aggregate([
        { $match: { schoolId: schoolId.toString ? schoolId : String(schoolId), studentId: { $in: allStudentIds.map(id => id.toString ? id : String(id)) } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$studentId', balance: { $first: '$balance' } } },
      ]),
    ]);

    // Build lookup maps for O(1) access inside the loop
    const existingInvoiceSet = new Set(existingInvoicesArr.map(i => String(i.studentId)));
    const concessionsByStudent = new Map();
    for (const c of allConcessionsArr) {
      const key = String(c.studentId);
      if (!concessionsByStudent.has(key)) concessionsByStudent.set(key, []);
      concessionsByStudent.get(key).push(c);
    }
    const ledgerBalanceMap = new Map(lastLedgersArr.map(r => [String(r._id), r.balance]));

    const generatedInvoices = [];
    const skippedStudents = [];
    let grossTotalAll = 0;
    let netTotalAll = 0;

    for (const assignment of assignments) {
      // Skip if duplicate invoice already exists (uses pre-fetched set — zero extra queries)
      if (existingInvoiceSet.has(String(assignment.studentId))) {
        skippedStudents.push(assignment.studentId);
        continue;
      }

      // Calculate items and totals
      let subtotal = 0;
      let totalDiscount = 0;
      let totalConcession = 0;
      let totalFine = 0;

      // Use pre-fetched concessions map (zero extra queries)
      const concessions = concessionsByStudent.get(String(assignment.studentId)) || [];

      const invoiceItemsData = [];

      for (const item of assignment.assignedItems) {
        const unitAmount = item.amount || 0;
        const grossAmount = unitAmount;
        let itemDiscount = 0;
        let itemConcession = 0;
        let itemFine = 0;

        if (item.concessionAllowed) {
          for (const conc of concessions) {
            const isCatMatch = conc.applicableFeeCategoryIds?.length === 0 ||
              conc.applicableFeeCategoryIds.some(catId => String(catId) === String(item.feeCategoryId));

            if (isCatMatch) {
              if (conc.type === 'PERCENTAGE') {
                itemConcession += Math.round((grossAmount * conc.value) / 100);
              } else if (conc.type === 'FIXED') {
                itemConcession += conc.value;
              }
              if (conc.maximumAmount && itemConcession > conc.maximumAmount) {
                itemConcession = conc.maximumAmount;
              }
            }
          }
        }

        const netAmount = Math.max(0, grossAmount - itemDiscount - itemConcession + itemFine);

        subtotal += grossAmount;
        totalDiscount += itemDiscount;
        totalConcession += itemConcession;
        totalFine += itemFine;

        invoiceItemsData.push({
          schoolId,
          feeCategoryId: item.feeCategoryId,
          feeStructureItemId: item.feeStructureItemId,
          description: item.name,
          quantity: 1,
          unitAmount,
          grossAmount,
          discountAmount: itemDiscount,
          concessionAmount: itemConcession,
          fineAmount: itemFine,
          netAmount,
          sequence: item.sequence || 1
        });
      }

      const totalAmount = Math.max(0, subtotal - totalDiscount - totalConcession + totalFine);
      const invoiceNumber = await generateSequenceNumber(schoolId, 'INVOICE');

      const invoice = await Invoice.create({
        schoolId,
        academicYearId,
        studentId: assignment.studentId,
        enrollmentId: assignment.enrollmentId,
        invoiceNumber,
        invoiceDate: new Date(),
        dueDate: new Date(dueDate),
        billingPeriod,
        subtotal,
        discountAmount: totalDiscount,
        concessionAmount: totalConcession,
        fineAmount: totalFine,
        taxAmount: 0,
        totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        status: 'ISSUED',
        createdBy: userId,
        updatedBy: userId
      });

      // Insert invoice items with invoiceId
      const itemsToCreate = invoiceItemsData.map(i => ({ ...i, invoiceId: invoice._id }));
      await InvoiceItem.insertMany(itemsToCreate);

      // Create Ledger entry (DEBIT) — use pre-fetched balance map (zero extra queries)
      const prevBalance = ledgerBalanceMap.get(String(assignment.studentId)) ?? 0;
      const newBalance = prevBalance + totalAmount; // Fee invoice increases balance owed
      // Update map so subsequent invoices for the same student use the running balance
      ledgerBalanceMap.set(String(assignment.studentId), newBalance);

      await StudentLedger.create({
        schoolId,
        academicYearId,
        studentId: assignment.studentId,
        referenceType: 'INVOICE',
        referenceId: invoice._id,
        transactionType: 'DEBIT',
        debit: totalAmount,
        credit: 0,
        balance: newBalance,
        description: `Fee Invoice ${invoice.invoiceNumber} for ${billingPeriod}`,
        transactionDate: new Date(),
        createdBy: userId
      });

      generatedInvoices.push(invoice);
      grossTotalAll += subtotal;
      netTotalAll += totalAmount;
    }

    return successResponse(res, {
      generatedCount: generatedInvoices.length,
      skippedCount: skippedStudents.length,
      grossTotal: grossTotalAll,
      netTotal: netTotalAll,
      invoices: generatedInvoices
    }, 'Bulk invoice generation completed successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateInvoiceStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const { status, reason } = req.body;

    const invoice = await Invoice.findOne({ _id: id, schoolId });
    if (!invoice) {
      return errorResponse(res, 'Invoice not found', 404, 'NOT_FOUND');
    }

    // State machine check
    const validTransitions = {
      DRAFT: ['ISSUED', 'CANCELLED'],
      ISSUED: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'CANCELLED'],
      PARTIALLY_PAID: ['PAID', 'VOID'],
      OVERDUE: ['PARTIALLY_PAID', 'PAID', 'VOID'],
      PAID: ['VOID'],
      CANCELLED: [],
      VOID: []
    };

    if (!validTransitions[invoice.status]?.includes(status)) {
      return errorResponse(res, `Invalid invoice transition from ${invoice.status} to ${status}`, 400, 'INVALID_TRANSITION');
    }

    const prevStatus = invoice.status;
    invoice.status = status;
    invoice.updatedBy = userId;
    await invoice.save();

    // If VOID or CANCELLED, create compensating ledger entry if necessary
    if (['VOID', 'CANCELLED'].includes(status) && invoice.balanceAmount > 0) {
      const lastLedger = await StudentLedger.findOne({ schoolId, studentId: invoice.studentId })
        .sort({ createdAt: -1 });

      const prevBalance = lastLedger ? lastLedger.balance : 0;
      const reverseAmount = invoice.balanceAmount;
      const newBalance = Math.max(0, prevBalance - reverseAmount);

      await StudentLedger.create({
        schoolId,
        academicYearId: invoice.academicYearId,
        studentId: invoice.studentId,
        referenceType: 'REVERSAL',
        referenceId: invoice._id,
        transactionType: 'CREDIT',
        debit: 0,
        credit: reverseAmount,
        balance: newBalance,
        description: `Invoice ${invoice.invoiceNumber} ${status}: Reversal of balance`,
        transactionDate: new Date(),
        createdBy: userId
      });
    }

    return successResponse(res, invoice, `Invoice status updated to ${status}`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInvoices,
  getInvoiceById,
  generateBulkInvoices,
  updateInvoiceStatus
};
