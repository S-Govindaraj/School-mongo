const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Refund = require('../models/Refund');
const FeeConcession = require('../models/FeeConcession');
const StudentLedger = require('../models/StudentLedger');
const InvoiceItem = require('../models/InvoiceItem');
const { successResponse, errorResponse } = require('../utils/response');

const getFinanceDashboardData = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { academicYearId } = req.query;

    const query = { schoolId };
    if (academicYearId) query.academicYearId = academicYearId;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Run parallel aggregation queries
    const [
      invoiceStats,
      todayPayments,
      monthlyPayments,
      pendingRefunds,
      pendingConcessions,
      categoryStats,
      methodStats
    ] = await Promise.all([
      // Total Billed, Total Collected, Total Balance
      Invoice.aggregate([
        { $match: { schoolId: req.schoolContext.schoolId, status: { $ne: 'CANCELLED' } } },
        {
          $group: {
            _id: null,
            totalBilled: { $sum: '$totalAmount' },
            totalCollected: { $sum: '$paidAmount' },
            totalOutstanding: { $sum: '$balanceAmount' },
            pendingCount: {
              $sum: { $cond: [{ $in: ['$status', ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']] }, 1, 0] }
            },
            overdueAmount: {
              $sum: { $cond: [{ $eq: ['$status', 'OVERDUE'] }, '$balanceAmount', 0] }
            }
          }
        }
      ]),

      // Today Collection
      Payment.aggregate([
        { $match: { schoolId: req.schoolContext.schoolId, status: 'SUCCESS', paymentDate: { $gte: startOfToday } } },
        { $group: { _id: null, totalToday: { $sum: '$amount' } } }
      ]),

      // Monthly Collection
      Payment.aggregate([
        { $match: { schoolId: req.schoolContext.schoolId, status: 'SUCCESS', paymentDate: { $gte: startOfMonth } } },
        { $group: { _id: null, totalMonth: { $sum: '$amount' } } }
      ]),

      // Pending Refunds
      Refund.countDocuments({ schoolId, status: 'REQUESTED' }),

      // Pending Concessions
      FeeConcession.countDocuments({ schoolId, status: 'PENDING' }),

      // Fee Category Collection breakdown via InvoiceItems
      InvoiceItem.aggregate([
        { $match: { schoolId: req.schoolContext.schoolId } },
        {
          $lookup: {
            from: 'feecategories',
            localField: 'feeCategoryId',
            foreignField: '_id',
            as: 'category'
          }
        },
        { $unwind: '$category' },
        {
          $group: {
            _id: '$category.name',
            amount: { $sum: '$netAmount' }
          }
        }
      ]),

      // Payment Method Distribution
      Payment.aggregate([
        { $match: { schoolId: req.schoolContext.schoolId, status: 'SUCCESS' } },
        {
          $group: {
            _id: '$paymentMethod',
            amount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const stats = invoiceStats[0] || { totalBilled: 0, totalCollected: 0, totalOutstanding: 0, pendingCount: 0, overdueAmount: 0 };
    const todayColl = todayPayments[0]?.totalToday || 0;
    const monthColl = monthlyPayments[0]?.totalMonth || 0;

    return successResponse(res, {
      kpis: {
        totalBilled: stats.totalBilled,
        totalCollected: stats.totalCollected,
        outstanding: stats.totalOutstanding,
        overdue: stats.overdueAmount,
        todayCollection: todayColl,
        monthlyCollection: monthColl,
        pendingInvoicesCount: stats.pendingCount,
        pendingRefundsCount: pendingRefunds,
        pendingConcessionsCount: pendingConcessions
      },
      categoryDistribution: categoryStats,
      paymentMethodDistribution: methodStats
    }, 'Finance dashboard data loaded successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFinanceDashboardData
};
