const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Admission = require('../models/Admission');
const AttendanceDay = require('../models/AttendanceDay');
const Invoice = require('../models/Invoice');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const { successResponse } = require('../utils/response');

const getAdminDashboardData = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      studentCount,
      staffCount,
      pendingAdmissions,
      studentsMarkedToday,
      financialStats,
      recentAnnouncements,
      unreadNotifications
    ] = await Promise.all([
      Student.countDocuments({ schoolId, status: 'ACTIVE' }),
      Staff.countDocuments({ schoolId, status: 'ACTIVE' }),
      Admission.countDocuments({ schoolId, status: 'PENDING' }),
      // Relabeled from "todayAttendanceSessions": under the single-collection
      // model this counts STUDENTS with any attendance activity today (one
      // doc per student per day), not class sessions started — a materially
      // different number than before, so it gets a new name rather than
      // silently changing what the old key meant.
      AttendanceDay.countDocuments({ schoolId, date: { $gte: startOfToday } }),
      Invoice.aggregate([
        { $match: { schoolId, status: { $ne: 'CANCELLED' } } },
        {
          $group: {
            _id: null,
            totalBilled: { $sum: '$totalAmount' },
            totalCollected: { $sum: '$paidAmount' },
            totalOutstanding: { $sum: '$balanceAmount' }
          }
        }
      ]),
      Announcement.find({ schoolId, status: 'PUBLISHED' })
        .sort({ publishAt: -1 })
        .limit(5),
      Notification.countDocuments({ recipientUserId: req.user?._id, status: 'UNREAD' })
    ]);

    const fin = financialStats[0] || { totalBilled: 0, totalCollected: 0, totalOutstanding: 0 };

    return successResponse(res, {
      kpis: {
        totalStudents: studentCount,
        totalStaff: staffCount,
        pendingAdmissions,
        studentsMarkedToday,
        totalBilled: fin.totalBilled,
        totalCollected: fin.totalCollected,
        totalOutstanding: fin.totalOutstanding,
        unreadNotifications
      },
      recentAnnouncements
    }, 'Admin dashboard data loaded successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminDashboardData
};
