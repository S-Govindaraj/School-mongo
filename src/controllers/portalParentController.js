const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const AttendanceRecord = require('../models/AttendanceRecord');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Timetable = require('../models/Timetable');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const { successResponse, errorResponse } = require('../utils/response');

// Helper to resolve parent's children
const getParentChildrenInternal = async (schoolId, userId) => {
  const guardian = await Guardian.findOne({ schoolId, userId });
  if (!guardian) return [];

  const links = await StudentGuardian.find({ schoolId, guardianId: guardian._id })
    .populate('studentId');

  const children = [];
  for (const link of links) {
    if (link.studentId) {
      const enrollment = await Enrollment.findOne({ schoolId, studentId: link.studentId._id, isCurrent: true })
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .populate('academicYearId', 'name code');

      children.push({
        student: link.studentId,
        relationship: link.relationship,
        isPrimaryContact: link.isPrimaryContact,
        enrollment
      });
    }
  }

  return children;
};

const getParentChildren = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const children = await getParentChildrenInternal(schoolId, userId);
    return successResponse(res, children, 'Parent children loaded successfully');
  } catch (error) {
    next(error);
  }
};

const getParentDashboardData = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { studentId } = req.query;

    const children = await getParentChildrenInternal(schoolId, userId);
    if (children.length === 0) {
      return successResponse(res, {
        children: [],
        selectedChild: null,
        attendanceSummary: null,
        financeSummary: null,
        todayTimetable: [],
        announcements: [],
        unreadNotifications: 0
      }, 'No children linked to this parent profile');
    }

    // Server-side security check: verify requested student belongs to parent!
    let targetChild = children[0];
    if (studentId) {
      const found = children.find(c => String(c.student._id) === String(studentId));
      if (!found) {
        return errorResponse(res, 'Unauthorized access to student record', 403, 'FORBIDDEN');
      }
      targetChild = found;
    }

    const sId = targetChild.student._id;
    const gradeId = targetChild.enrollment?.gradeId?._id;
    const sectionId = targetChild.enrollment?.sectionId?._id;

    // Fetch Attendance summary
    const records = await AttendanceRecord.find({ schoolId, studentId: sId })
      .populate('statusId', 'code name category');

    const totalAttendance = records.length;
    const presentCount = records.filter(r => r.statusId?.code === 'PRESENT').length;
    const absentCount = records.filter(r => r.statusId?.code === 'ABSENT').length;
    const lateCount = records.filter(r => r.statusId?.code === 'LATE').length;
    const attendancePercentage = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 100;

    // Fetch Finance summary
    const invoices = await Invoice.find({ schoolId, studentId: sId, status: { $ne: 'CANCELLED' } });
    const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const outstandingBalance = invoices.reduce((s, i) => s + i.balanceAmount, 0);

    // Fetch Today's Timetable
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayDay = days[new Date().getDay()];

    let todayTimetable = [];
    if (gradeId && sectionId) {
      todayTimetable = await Timetable.find({
        schoolId,
        gradeId,
        sectionId,
        dayOfWeek: todayDay,
        status: 'ACTIVE'
      })
      .populate('subjectId', 'name code')
      .populate('teacherId', 'firstName lastName')
      .populate('periodId', 'name startTime endTime periodType')
      .sort({ 'periodId.startTime': 1 });
    }

    // Announcements
    const announcements = await Announcement.find({
      schoolId,
      status: 'PUBLISHED',
      $or: [
        { audienceType: 'SCHOOL' },
        { targetGradeIds: gradeId },
        { targetSectionIds: sectionId },
        { targetStudentIds: sId }
      ]
    }).sort({ publishAt: -1 }).limit(5);

    const unreadNotifications = await Notification.countDocuments({
      recipientUserId: userId,
      status: 'UNREAD'
    });

    return successResponse(res, {
      children,
      selectedChild: targetChild,
      attendanceSummary: {
        totalDays: totalAttendance,
        presentCount,
        absentCount,
        lateCount,
        percentage: attendancePercentage
      },
      financeSummary: {
        totalBilled,
        totalPaid,
        outstandingBalance
      },
      todayTimetable,
      announcements,
      unreadNotifications
    }, 'Parent dashboard loaded successfully');
  } catch (error) {
    next(error);
  }
};

const getChildAttendance = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { studentId } = req.params;

    const children = await getParentChildrenInternal(schoolId, userId);
    const isOwner = children.some(c => String(c.student._id) === String(studentId));
    if (!isOwner) {
      return errorResponse(res, 'Unauthorized access to student record', 403, 'FORBIDDEN');
    }

    const records = await AttendanceRecord.find({ schoolId, studentId })
      .populate('statusId', 'code name category')
      .sort({ date: -1 });

    return successResponse(res, records, 'Child attendance records loaded');
  } catch (error) {
    next(error);
  }
};

const getChildFees = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { studentId } = req.params;

    const children = await getParentChildrenInternal(schoolId, userId);
    const isOwner = children.some(c => String(c.student._id) === String(studentId));
    if (!isOwner) {
      return errorResponse(res, 'Unauthorized access to student record', 403, 'FORBIDDEN');
    }

    const [invoices, payments] = await Promise.all([
      Invoice.find({ schoolId, studentId, status: { $ne: 'CANCELLED' } }).sort({ createdAt: -1 }),
      Payment.find({ schoolId, studentId, status: 'SUCCESS' }).sort({ paymentDate: -1 })
    ]);

    return successResponse(res, { invoices, payments }, 'Child fee records loaded');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getParentChildren,
  getParentDashboardData,
  getChildAttendance,
  getChildFees
};
