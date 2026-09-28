const Student = require('../models/Student');
const AttendanceDay = require('../models/AttendanceDay');
const Invoice = require('../models/Invoice');
const Vehicle = require('../models/Vehicle');
const BookCopy = require('../models/BookCopy');
const Announcement = require('../models/Announcement');

const sendSuccess = (res, data = {}, status = 200) => {
  res.status(status).json({
    success: true,
    data,
    meta: { requestId: res.req?.requestId || res.req?.id || 'req_' + Date.now() },
  });
};

exports.getExecutiveDashboard = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;

    // Real rolling 30-day attendance rate (was hardcoded 96.4 — see
    // ATTENDANCE_REDESIGN.md finding #17), same countsAsPresent semantics
    // as attendanceController.js's summary endpoints.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalStudents,
      activeVehicles,
      totalBooks,
      issuedBooks,
      totalBilled,
      totalCollected,
      totalAnnouncements,
      attendanceAgg,
    ] = await Promise.all([
      Student.countDocuments({ schoolId, status: 'ACTIVE' }),
      Vehicle.countDocuments({ schoolId, status: 'ACTIVE' }),
      BookCopy.countDocuments({ schoolId }),
      BookCopy.countDocuments({ schoolId, status: 'ISSUED' }),
      Invoice.aggregate([{ $match: { schoolId } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Invoice.aggregate([{ $match: { schoolId } }, { $group: { _id: null, total: { $sum: '$paidAmount' } } }]),
      Announcement.countDocuments({ schoolId }),
      AttendanceDay.aggregate([
        { $match: { schoolId, date: { $gte: thirtyDaysAgo } } },
        { $unwind: '$periods' },
        { $match: { 'periods.statusId': { $ne: null } } },
        { $lookup: { from: 'attendanceStatuses', localField: 'periods.statusId', foreignField: '_id', as: 'status' } },
        { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } },
        { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status.countsAsPresent', true] }, 1, 0] } } } },
      ]),
    ]);

    const billedSum = totalBilled[0]?.total || 0;
    const collectedSum = totalCollected[0]?.total || 0;
    const attendanceTotal = attendanceAgg[0]?.total || 0;
    const attendanceRate = attendanceTotal > 0
      ? Number(((attendanceAgg[0].present / attendanceTotal) * 100).toFixed(1))
      : null;

    sendSuccess(res, {
      kpis: {
        totalStudents,
        attendanceRate,
        academicAverage: 'B+ (84.2%)',
        billedAmount: billedSum,
        collectedAmount: collectedSum,
        outstandingAmount: billedSum - collectedSum,
        activeVehicles,
        libraryIssued: issuedBooks,
        announcementsCount: totalAnnouncements
      },
      collectionTrend: [
        { month: 'Apr', billed: 120000, collected: 110000 },
        { month: 'May', billed: 120000, collected: 115000 },
        { month: 'Jun', billed: 120000, collected: 108000 },
        { month: 'Jul', billed: 120000, collected: 118000 },
        { month: 'Aug', billed: 120000, collected: 120000 },
        { month: 'Sep', billed: 120000, collected: 95000 },
      ]
    });
  } catch (err) {
    next(err);
  }
};

exports.getAcademicAnalytics = async (req, res, next) => {
  try {
    sendSuccess(res, {
      gradePerformance: [
        { grade: 'Grade 1', passRate: 98, avgScore: 88 },
        { grade: 'Grade 5', passRate: 95, avgScore: 82 },
        { grade: 'Grade 8', passRate: 92, avgScore: 79 },
        { grade: 'Grade 10', passRate: 90, avgScore: 78 }
      ],
      subjectPerformance: [
        { subject: 'Mathematics', avgScore: 81 },
        { subject: 'Science', avgScore: 84 },
        { subject: 'English', avgScore: 89 },
        { subject: 'Social Studies', avgScore: 86 }
      ]
    });
  } catch (err) {
    next(err);
  }
};

// Previously fully hardcoded mock data (ATTENDANCE_REDESIGN.md finding #17)
// — AttendanceRecord was imported but never queried. Now a real aggregation
// over the last 6 months, joined against AttendanceStatus for the
// countsAsPresent/countsAsAbsent flags (matches the same semantics
// attendanceController.js's summary endpoints use) and against Grade for
// the per-grade breakdown.
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

exports.getAttendanceAnalytics = async (req, res, next) => {
  try {
    const mongoose = require('mongoose');
    const schoolObjectId = new mongoose.Types.ObjectId(req.schoolContext.schoolId);

    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - 5);
    sinceDate.setDate(1);
    sinceDate.setHours(0, 0, 0, 0);

    const periodUnwindStage = { $unwind: '$periods' };
    const markedOnlyStage = { $match: { 'periods.statusId': { $ne: null } } };
    const statusLookupStage = {
      $lookup: { from: 'attendanceStatuses', localField: 'periods.statusId', foreignField: '_id', as: 'status' },
    };
    const statusUnwindStage = { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } };

    const [monthlyTrendRaw, absenteeismRaw] = await Promise.all([
      AttendanceDay.aggregate([
        { $match: { schoolId: schoolObjectId, date: { $gte: sinceDate } } },
        periodUnwindStage,
        markedOnlyStage,
        statusLookupStage,
        statusUnwindStage,
        {
          $group: {
            _id: { year: { $year: '$date' }, month: { $month: '$date' } },
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ['$status.countsAsPresent', true] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status.countsAsAbsent', true] }, 1, 0] } },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      AttendanceDay.aggregate([
        { $match: { schoolId: schoolObjectId, date: { $gte: sinceDate } } },
        periodUnwindStage,
        markedOnlyStage,
        statusLookupStage,
        statusUnwindStage,
        { $lookup: { from: 'grades', localField: 'gradeId', foreignField: '_id', as: 'grade' } },
        { $unwind: { path: '$grade', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$gradeId',
            gradeName: { $first: '$grade.name' },
            total: { $sum: 1 },
            absent: { $sum: { $cond: [{ $eq: ['$status.countsAsAbsent', true] }, 1, 0] } },
          },
        },
        { $match: { total: { $gt: 0 } } },
        { $sort: { gradeName: 1 } },
      ]),
    ]);

    const monthlyAttendanceTrend = monthlyTrendRaw.map((m) => ({
      month: MONTH_NAMES[m._id.month - 1],
      present: m.total > 0 ? Number(((m.present / m.total) * 100).toFixed(1)) : 0,
      absent: m.total > 0 ? Number(((m.absent / m.total) * 100).toFixed(1)) : 0,
    }));

    const absenteeismByGrade = absenteeismRaw.map((g) => ({
      grade: g.gradeName || 'Unknown Grade',
      rate: Number(((g.absent / g.total) * 100).toFixed(1)),
    }));

    sendSuccess(res, { monthlyAttendanceTrend, absenteeismByGrade });
  } catch (err) {
    next(err);
  }
};

exports.getFinanceAnalytics = async (req, res, next) => {
  try {
    sendSuccess(res, {
      agingBuckets: [
        { bucket: '0–30 Days', amount: 45000, count: 12 },
        { bucket: '31–60 Days', amount: 28000, count: 8 },
        { bucket: '61–90 Days', amount: 15000, count: 4 },
        { bucket: '90+ Days', amount: 9500, count: 2 }
      ],
      paymentMethodBreakdown: [
        { method: 'UPI / Online', percentage: 65 },
        { method: 'Bank Transfer', percentage: 22 },
        { method: 'Cash', percentage: 13 }
      ]
    });
  } catch (err) {
    next(err);
  }
};

// The ATTENDANCE insight below is now real (biggest week-over-week
// absenteeism increase by grade, only surfaced when it actually happened —
// no insight is fabricated when nothing crossed the threshold). The
// FINANCE/TRANSPORT/LIBRARY insights remain illustrative placeholders —
// wiring those to real data belongs to those modules' own work, out of
// scope for the attendance redesign this touched.
exports.getOperationalInsights = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;

    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - 7);
    const startOfLastWeek = new Date(now);
    startOfLastWeek.setDate(now.getDate() - 14);

    const weeklyAbsenceByGrade = (from, to) =>
      AttendanceDay.aggregate([
        { $match: { schoolId, date: { $gte: from, $lt: to } } },
        { $unwind: '$periods' },
        { $match: { 'periods.statusId': { $ne: null } } },
        { $lookup: { from: 'attendanceStatuses', localField: 'periods.statusId', foreignField: '_id', as: 'status' } },
        { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'grades', localField: 'gradeId', foreignField: '_id', as: 'grade' } },
        { $unwind: { path: '$grade', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$gradeId',
            gradeName: { $first: '$grade.name' },
            total: { $sum: 1 },
            absent: { $sum: { $cond: [{ $eq: ['$status.countsAsAbsent', true] }, 1, 0] } },
          },
        },
      ]);

    const [thisWeek, lastWeek] = await Promise.all([
      weeklyAbsenceByGrade(startOfThisWeek, now),
      weeklyAbsenceByGrade(startOfLastWeek, startOfThisWeek),
    ]);

    const lastWeekMap = new Map(lastWeek.map((g) => [String(g._id), g]));
    let biggestDrop = null;
    for (const g of thisWeek) {
      if (!g.total) continue;
      const prev = lastWeekMap.get(String(g._id));
      if (!prev || !prev.total) continue;
      const delta = (g.absent / g.total) * 100 - (prev.absent / prev.total) * 100;
      if (delta > 1 && (!biggestDrop || delta > biggestDrop.delta)) {
        biggestDrop = { gradeName: g.gradeName || 'Unknown Grade', delta };
      }
    }

    let nextId = 1;
    const insights = [];
    if (biggestDrop) {
      insights.push({
        id: nextId++,
        type: 'ATTENDANCE',
        title: `${biggestDrop.gradeName} Attendance Drop`,
        message: `${biggestDrop.gradeName} absenteeism rose ${biggestDrop.delta.toFixed(1)} percentage points versus last week.`,
        severity: biggestDrop.delta > 5 ? 'URGENT' : 'WARNING',
      });
    }

    insights.push(
      { id: nextId++, type: 'FINANCE', title: 'Overdue Fee Invoices', message: '14 fee invoices are overdue past 30 days.', severity: 'URGENT' },
      { id: nextId++, type: 'TRANSPORT', title: 'Vehicle Insurance Renewal', message: 'Bus KA-01-EA-1008 insurance expires in 12 days.', severity: 'WARNING' },
      { id: nextId++, type: 'LIBRARY', title: 'Overdue Book Returns', message: '6 library books are overdue past loan limit.', severity: 'INFO' }
    );

    sendSuccess(res, { insights });
  } catch (err) {
    next(err);
  }
};
