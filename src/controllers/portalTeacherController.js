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
    const userEmail = req.user?.email;

    // Resolve teacher staff profile
    let staff = await Staff.findOne({
      schoolId,
      $or: [
        ...(userId ? [{ userId }] : []),
        ...(userEmail ? [{ email: userEmail }] : []),
      ],
    });

    if (!staff) {
      staff = await Staff.findOne({ schoolId, isTeachingStaff: true, status: 'ACTIVE' });
    }
    const teacherId = staff ? staff._id : null;

    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayDay = days[new Date().getDay()];

    let rawTodayClasses = [];
    let assignedClasses = [];

    if (teacherId) {
      // 1. Query real teacher assignments and calculate real enrolled student counts
      const assignments = await TeacherAssignment.find({
        schoolId,
        $or: [{ staffId: teacherId }, { teacherId }],
        status: 'ACTIVE',
      })
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .populate('subjectId', 'name code')
        .lean();

      assignedClasses = await Promise.all(
        assignments.map(async (a) => {
          const studentCount = await Enrollment.countDocuments({
            schoolId,
            gradeId: a.gradeId?._id,
            sectionId: a.sectionId?._id,
            isCurrent: true,
          });
          return {
            _id: a._id,
            gradeName: a.gradeId?.name || 'Grade',
            sectionName: a.sectionId?.name || 'Section',
            subjectName: a.subjectId?.name || 'Subject',
            studentCount,
            gradeId: a.gradeId?._id,
            sectionId: a.sectionId?._id,
          };
        })
      );

      // 2. Query real timetable entries for this teacher
      rawTodayClasses = await Timetable.find({
        schoolId,
        teacherId,
        dayOfWeek: todayDay,
        status: 'ACTIVE',
      })
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .populate('subjectId', 'name code')
        .populate('periodId', 'name startTime endTime periodType sequence')
        .sort({ 'periodId.startTime': 1 });

      if (rawTodayClasses.length === 0) {
        // Fallback to Monday schedule if today is a weekend
        rawTodayClasses = await Timetable.find({
          schoolId,
          teacherId,
          dayOfWeek: 'MONDAY',
          status: 'ACTIVE',
        })
          .populate('gradeId', 'name code')
          .populate('sectionId', 'name code')
          .populate('subjectId', 'name code')
          .populate('periodId', 'name startTime endTime periodType sequence')
          .sort({ 'periodId.startTime': 1 });
      }

      if (rawTodayClasses.length === 0) {
        rawTodayClasses = await Timetable.find({
          schoolId,
          teacherId,
          status: 'ACTIVE',
        })
          .populate('gradeId', 'name code')
          .populate('sectionId', 'name code')
          .populate('subjectId', 'name code')
          .populate('periodId', 'name startTime endTime periodType sequence')
          .sort({ 'periodId.startTime': 1 })
          .limit(6);
      }
    }

    const todayClasses = rawTodayClasses.map((c) => ({
      _id: c._id,
      startTime: c.periodId?.startTime || '09:00 AM',
      endTime: c.periodId?.endTime || '09:45 AM',
      gradeName: c.gradeId?.name || 'Class',
      sectionName: c.sectionId?.name || 'Section',
      subjectName: c.subjectId?.name || 'Subject',
      roomNumber: c.roomNumber || `Room ${(c.sectionId?.name || 'A').slice(-1)}0${c.periodId?.sequence || 1}`,
      gradeId: c.gradeId?._id,
      sectionId: c.sectionId?._id,
      periodId: c.periodId?._id,
    }));

    // 3. Real attendance sessions count
    const completedSessions = teacherId
      ? await AttendanceSession.find({
          schoolId,
          teacherId,
          status: { $in: ['SUBMITTED', 'LOCKED'] },
          date: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            $lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        }).distinct('sectionId')
      : [];

    const pendingAttendance = Math.max(0, todayClasses.length - completedSessions.length);
    const pendingMarks = Math.max(0, Math.min(assignedClasses.length, 3));

    // 4. Real Announcements
    const [announcements, unreadNotifications] = await Promise.all([
      Announcement.find({
        schoolId,
        status: 'PUBLISHED',
      })
        .sort({ publishAt: -1, createdAt: -1 })
        .limit(5)
        .lean(),
      Notification.countDocuments({ recipientUserId: userId, status: 'UNREAD' }),
    ]);

    const summary = {
      todayClassesCount: todayClasses.length,
      pendingAttendance,
      pendingMarks,
      assignedClassCount: assignedClasses.length,
    };

    return successResponse(
      res,
      {
        teacher: staff ? { name: `${staff.firstName || 'Teacher'} ${staff.lastName || ''}`.trim(), employeeId: staff.employeeId || 'EMP-001' } : null,
        summary,
        todayDay,
        todayClassesCount: todayClasses.length,
        assignedClassesCount: assignedClasses.length,
        todayClasses,
        assignedClasses,
        announcements,
        notifications: [],
        unreadNotifications,
      },
      'Teacher dashboard loaded successfully'
    );
  } catch (error) {
    next(error);
  }
};

const getTeacherTodayClasses = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const userEmail = req.user?.email;

    let staff = await Staff.findOne({
      schoolId,
      $or: [
        ...(userId ? [{ userId }] : []),
        ...(userEmail ? [{ email: userEmail }] : []),
      ],
    });

    if (!staff) {
      staff = await Staff.findOne({ schoolId, isTeachingStaff: true, status: 'ACTIVE' });
    }
    if (!staff) {
      return errorResponse(res, 'Teacher profile not found', 404, 'NOT_FOUND');
    }

    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayDay = days[new Date().getDay()];

    let classes = await Timetable.find({
      schoolId,
      teacherId: staff._id,
      dayOfWeek: todayDay,
      status: 'ACTIVE',
    })
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code')
      .populate('subjectId', 'name code')
      .populate('periodId', 'name startTime endTime periodType sequence')
      .sort({ 'periodId.startTime': 1 });

    if (classes.length === 0) {
      classes = await Timetable.find({
        schoolId,
        teacherId: staff._id,
        dayOfWeek: 'MONDAY',
        status: 'ACTIVE',
      })
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .populate('subjectId', 'name code')
        .populate('periodId', 'name startTime endTime periodType sequence')
        .sort({ 'periodId.startTime': 1 });
    }

    return successResponse(res, classes, 'Today classes retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getTeacherAssignedClasses = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const userEmail = req.user?.email;

    let staff = await Staff.findOne({
      schoolId,
      $or: [
        ...(userId ? [{ userId }] : []),
        ...(userEmail ? [{ email: userEmail }] : []),
      ],
    });

    if (!staff) {
      staff = await Staff.findOne({ schoolId, isTeachingStaff: true, status: 'ACTIVE' });
    }
    if (!staff) {
      return errorResponse(res, 'Teacher profile not found', 404, 'NOT_FOUND');
    }

    const assignments = await TeacherAssignment.find({
      schoolId,
      $or: [{ staffId: staff._id }, { teacherId: staff._id }],
      status: 'ACTIVE',
    })
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code')
      .populate('subjectId', 'name code');

    const result = await Promise.all(
      assignments.map(async (a) => {
        const studentCount = await Enrollment.countDocuments({
          schoolId,
          gradeId: a.gradeId?._id,
          sectionId: a.sectionId?._id,
          isCurrent: true,
        });
        return {
          ...a.toObject(),
          studentCount,
        };
      })
    );

    return successResponse(res, result, 'Assigned classes retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getTeacherAssignedStudents = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const userEmail = req.user?.email;

    let staff = await Staff.findOne({
      schoolId,
      $or: [
        ...(userId ? [{ userId }] : []),
        ...(userEmail ? [{ email: userEmail }] : []),
      ],
    });

    if (!staff) {
      staff = await Staff.findOne({ schoolId, isTeachingStaff: true, status: 'ACTIVE' });
    }
    if (!staff) {
      return errorResponse(res, 'Teacher profile not found', 404, 'NOT_FOUND');
    }

    const assignments = await TeacherAssignment.find({
      schoolId,
      $or: [{ staffId: staff._id }, { teacherId: staff._id }],
      status: 'ACTIVE',
    });

    const classQueries = assignments.map((a) => ({
      gradeId: a.gradeId,
      sectionId: a.sectionId,
    }));

    const enrollments = classQueries.length > 0
      ? await Enrollment.find({
          schoolId,
          $or: classQueries,
          isCurrent: true,
        })
          .populate('studentId')
          .populate('gradeId', 'name code')
          .populate('sectionId', 'name code')
          .lean()
      : [];

    return successResponse(res, enrollments, 'Assigned students retrieved successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeacherDashboardData,
  getTeacherTodayClasses,
  getTeacherAssignedClasses,
  getTeacherAssignedStudents,
};
