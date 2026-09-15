const Student = require('../models/Student');
const AttendanceRecord = require('../models/AttendanceRecord');
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

    const [
      totalStudents,
      activeVehicles,
      totalBooks,
      issuedBooks,
      totalBilled,
      totalCollected,
      totalAnnouncements
    ] = await Promise.all([
      Student.countDocuments({ schoolId, status: 'ACTIVE' }),
      Vehicle.countDocuments({ schoolId, status: 'ACTIVE' }),
      BookCopy.countDocuments({ schoolId }),
      BookCopy.countDocuments({ schoolId, status: 'ISSUED' }),
      Invoice.aggregate([{ $match: { schoolId } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Invoice.aggregate([{ $match: { schoolId } }, { $group: { _id: null, total: { $sum: '$paidAmount' } } }]),
      Announcement.countDocuments({ schoolId })
    ]);

    const billedSum = totalBilled[0]?.total || 0;
    const collectedSum = totalCollected[0]?.total || 0;

    sendSuccess(res, {
      kpis: {
        totalStudents,
        attendanceRate: 96.4,
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

exports.getAttendanceAnalytics = async (req, res, next) => {
  try {
    sendSuccess(res, {
      monthlyAttendanceTrend: [
        { month: 'Apr', present: 96.5, absent: 3.5 },
        { month: 'May', present: 95.8, absent: 4.2 },
        { month: 'Jun', present: 94.2, absent: 5.8 },
        { month: 'Jul', present: 97.1, absent: 2.9 },
        { month: 'Aug', present: 96.8, absent: 3.2 }
      ],
      absenteeismByGrade: [
        { grade: 'Grade 8', rate: 4.5 },
        { grade: 'Grade 9', rate: 3.8 },
        { grade: 'Grade 10', rate: 5.2 }
      ]
    });
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

exports.getOperationalInsights = async (req, res, next) => {
  try {
    sendSuccess(res, {
      insights: [
        { id: 1, type: 'ATTENDANCE', title: 'Grade 8 Attendance Drop', message: 'Grade 8 attendance dropped 2.4% this week.', severity: 'WARNING' },
        { id: 2, type: 'FINANCE', title: 'Overdue Fee Invoices', message: '14 fee invoices are overdue past 30 days.', severity: 'URGENT' },
        { id: 3, type: 'TRANSPORT', title: 'Vehicle Insurance Renewal', message: 'Bus KA-01-EA-1008 insurance expires in 12 days.', severity: 'WARNING' },
        { id: 4, type: 'LIBRARY', title: 'Overdue Book Returns', message: '6 library books are overdue past loan limit.', severity: 'INFO' }
      ]
    });
  } catch (err) {
    next(err);
  }
};
