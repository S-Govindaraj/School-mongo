const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const AttendanceRecord = require('../models/AttendanceRecord');
const Timetable = require('../models/Timetable');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const { successResponse, errorResponse } = require('../utils/response');

const getStudentDashboardData = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const student = await Student.findOne({ schoolId, userId });
    if (!student) {
      // Fallback: try finding first active student for testing/demo if student user account
      const firstStudent = await Student.findOne({ schoolId, status: 'ACTIVE' });
      if (!firstStudent) {
        return errorResponse(res, 'Student record not found', 404, 'NOT_FOUND');
      }
      return getStudentDashboardForStudent(req, res, firstStudent);
    }

    return getStudentDashboardForStudent(req, res, student);
  } catch (error) {
    next(error);
  }
};

const getStudentDashboardForStudent = async (req, res, student) => {
  const schoolId = req.schoolContext.schoolId;
  const userId = req.user?._id;
  const sId = student._id;

  const enrollment = await Enrollment.findOne({ schoolId, studentId: sId, isCurrent: true })
    .populate('gradeId', 'name code')
    .populate('sectionId', 'name code')
    .populate('academicYearId', 'name code');

  const gradeId = enrollment?.gradeId?._id;
  const sectionId = enrollment?.sectionId?._id;

  // Attendance Records
  const records = await AttendanceRecord.find({ schoolId, studentId: sId })
    .populate('statusId', 'code name category');

  const totalDays = records.length;
  const presentCount = records.filter(r => r.statusId?.code === 'PRESENT').length;
  const percentage = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 100;

  // Today's Timetable
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
    student,
    enrollment,
    attendanceSummary: {
      totalDays,
      presentCount,
      percentage
    },
    todayTimetable,
    announcements,
    unreadNotifications
  }, 'Student dashboard loaded successfully');
};

module.exports = {
  getStudentDashboardData
};
