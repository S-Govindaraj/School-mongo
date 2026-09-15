const TeacherAssignment = require('../models/TeacherAssignment');
const Timetable = require('../models/Timetable');
const AttendanceSession = require('../models/AttendanceSession');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const Staff = require('../models/Staff');
const { successResponse, errorResponse } = require('../utils/response');

const getTeacherDashboardData = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    // Resolve teacher staff profile
    const staff = await Staff.findOne({ schoolId, userId });
    const teacherId = staff ? staff._id : null;

    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayDay = days[new Date().getDay()];

    let todayClasses = [];
    let assignedClassesCount = 0;

    if (teacherId) {
      const assignments = await TeacherAssignment.find({ schoolId, teacherId, status: 'ACTIVE' });
      assignedClassesCount = assignments.length;

      todayClasses = await Timetable.find({
        schoolId,
        teacherId,
        dayOfWeek: todayDay,
        status: 'ACTIVE'
      })
      .populate('gradeId', 'name')
      .populate('sectionId', 'name')
      .populate('subjectId', 'name code')
      .populate('periodId', 'name startTime endTime periodType')
      .sort({ 'periodId.startTime': 1 });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [announcements, unreadNotifications] = await Promise.all([
      Announcement.find({
        schoolId,
        status: 'PUBLISHED',
        $or: [
          { audienceType: 'SCHOOL' },
          { audienceType: 'STAFF' }
        ]
      }).sort({ publishAt: -1 }).limit(5),
      Notification.countDocuments({ recipientUserId: userId, status: 'UNREAD' })
    ]);

    return successResponse(res, {
      teacher: staff ? { name: `${staff.firstName} ${staff.lastName}`, employeeId: staff.employeeId } : null,
      todayDay,
      todayClassesCount: todayClasses.length,
      assignedClassesCount,
      todayClasses,
      announcements,
      unreadNotifications
    }, 'Teacher dashboard loaded successfully');
  } catch (error) {
    next(error);
  }
};

const getTeacherTodayClasses = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const staff = await Staff.findOne({ schoolId, userId });
    if (!staff) {
      return errorResponse(res, 'Teacher staff profile not found', 404, 'NOT_FOUND');
    }

    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayDay = days[new Date().getDay()];

    const todayClasses = await Timetable.find({
      schoolId,
      teacherId: staff._id,
      dayOfWeek: todayDay,
      status: 'ACTIVE'
    })
    .populate('gradeId', 'name')
    .populate('sectionId', 'name')
    .populate('subjectId', 'name code')
    .populate('periodId', 'name startTime endTime periodType')
    .sort({ 'periodId.startTime': 1 });

    return successResponse(res, {
      dayOfWeek: todayDay,
      classes: todayClasses
    }, 'Today classes loaded');
  } catch (error) {
    next(error);
  }
};

const getTeacherAssignedStudents = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const staff = await Staff.findOne({ schoolId, userId });
    if (!staff) {
      return errorResponse(res, 'Teacher staff profile not found', 404, 'NOT_FOUND');
    }

    // Get assigned grade & section IDs
    const assignments = await TeacherAssignment.find({ schoolId, teacherId: staff._id, status: 'ACTIVE' });
    const gradeIds = [...new Set(assignments.map(a => String(a.gradeId)))];
    const sectionIds = [...new Set(assignments.map(a => String(a.sectionId)))];

    const enrollments = await Enrollment.find({
      schoolId,
      isCurrent: true,
      gradeId: { $in: gradeIds },
      sectionId: { $in: sectionIds }
    })
    .populate('studentId', 'firstName lastName admissionNumber studentNumber gender dob email phone status')
    .populate('gradeId', 'name')
    .populate('sectionId', 'name');

    const students = enrollments.map(e => ({
      student: e.studentId,
      grade: e.gradeId,
      section: e.sectionId
    }));

    return successResponse(res, students, 'Assigned class students loaded');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeacherDashboardData,
  getTeacherTodayClasses,
  getTeacherAssignedStudents
};
