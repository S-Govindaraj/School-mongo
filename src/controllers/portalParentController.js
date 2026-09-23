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
const ExamResult = require('../models/ExamResult');
const { successResponse, errorResponse } = require('../utils/response');

// Helper to resolve parent's children from real DB relations
const getParentChildrenInternal = async (schoolId, user) => {
  const userId = user?._id;
  const userEmail = user?.email;

  const guardian = await Guardian.findOne({
    schoolId,
    $or: [
      ...(userId ? [{ userId }] : []),
      ...(userEmail ? [{ email: userEmail }] : []),
    ],
  });

  const children = [];

  if (guardian) {
    const links = await StudentGuardian.find({ schoolId, guardianId: guardian._id }).populate('studentId');
    for (const link of links) {
      if (link.studentId) {
        const enrollment = await Enrollment.findOne({ schoolId, studentId: link.studentId._id, isCurrent: true })
          .populate('gradeId', 'name code')
          .populate('sectionId', 'name code')
          .populate('academicYearId', 'name code');

        children.push({
          _id: String(link.studentId._id),
          firstName: link.studentId.firstName,
          lastName: link.studentId.lastName,
          admissionNumber: link.studentId.admissionNumber || link.studentId.studentNumber || 'ADM-101',
          gradeName: enrollment?.gradeId?.name || 'Class',
          sectionName: enrollment?.sectionId?.name || 'Section',
          relationship: link.relationship || 'Parent',
          student: link.studentId,
          enrollment,
        });
      }
    }
  }

  // Fallback for Admin preview to demo students with full real data
  if (children.length === 0) {
    const sampleStudents = await Student.find({ schoolId, status: { $in: ['ACTIVE', 'ADMITTED'] } })
      .sort({ admissionNumber: 1 })
      .limit(2)
      .lean();

    for (const s of sampleStudents) {
      const enrollment = await Enrollment.findOne({ schoolId, studentId: s._id, isCurrent: true })
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .populate('academicYearId', 'name code');

      children.push({
        _id: String(s._id),
        firstName: s.firstName,
        lastName: s.lastName,
        admissionNumber: s.admissionNumber || s.studentNumber || 'ADM-101',
        gradeName: enrollment?.gradeId?.name || 'Class',
        sectionName: enrollment?.sectionId?.name || 'Section',
        relationship: 'Parent',
        student: s,
        enrollment,
      });
    }
  }

  return children;
};

const getParentChildren = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const children = await getParentChildrenInternal(schoolId, req.user);
    return successResponse(res, children, 'Parent children loaded successfully');
  } catch (error) {
    next(error);
  }
};

const getParentDashboardData = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { studentId } = req.query;

    const children = await getParentChildrenInternal(schoolId, req.user);
    if (children.length === 0) {
      return successResponse(res, {
        children: [],
        selectedChild: null,
        summary: { attendancePercentage: 0, feeBalance: 0, academicAverage: 'N/A', upcomingExam: 'None' },
        attendance: { present: 0, absent: 0, late: 0, leave: 0, records: [] },
        fees: { totalAmount: 0, paidAmount: 0, outstandingAmount: 0, overdue: 0 },
        academics: [],
        timetable: [],
        announcements: [],
      }, 'No children linked to this parent profile');
    }

    let targetChild = children[0];
    if (studentId) {
      const found = children.find((c) => String(c._id) === String(studentId) || String(c.student?._id) === String(studentId));
      if (found) targetChild = found;
    }

    const sId = targetChild.student?._id || targetChild._id;
    const gradeId = targetChild.enrollment?.gradeId?._id;
    const sectionId = targetChild.enrollment?.sectionId?._id;
    const sectionName = targetChild.sectionName || '';

    // 1. Real Attendance Records & Metrics
    const records = await AttendanceRecord.find({ schoolId, studentId: sId })
      .populate('statusId', 'code name category')
      .sort({ date: -1 })
      .limit(30)
      .lean();

    const presentCount = records.filter((r) => r.statusId?.code === 'PRESENT').length;
    const absentCount = records.filter((r) => r.statusId?.code === 'ABSENT').length;
    const lateCount = records.filter((r) => r.statusId?.code === 'LATE').length;
    const leaveCount = records.filter((r) => r.statusId?.code === 'EXCUSED' || r.statusId?.code === 'LEAVE').length;
    const totalDays = records.length;
    const attendancePercentage = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 100;

    const formattedAttendanceRecords = records.map((r) => ({
      _id: r._id,
      date: new Date(r.date).toLocaleDateString('en-GB'),
      status: r.statusId?.code || 'PRESENT',
      remarks: r.remarks || '',
    }));

    // 2. Real Invoices & Fees Summary
    const invoices = await Invoice.find({ schoolId, studentId: sId, status: { $ne: 'CANCELLED' } })
      .sort({ invoiceDate: -1 })
      .lean();

    const totalAmount = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
    const paidAmount = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
    const outstandingAmount = invoices.reduce((s, i) => s + (i.balanceAmount || 0), 0);
    const overdueCount = invoices.filter((i) => i.dueDate && new Date(i.dueDate) < new Date() && (i.balanceAmount || 0) > 0).length;

    // 3. Real Academics & Exam Results
    const examResults = await ExamResult.find({ schoolId, studentId: sId, status: 'PUBLISHED' })
      .populate('subjectId', 'name code')
      .sort({ publishedAt: -1 })
      .lean();

    const academicsData = examResults.map((e) => ({
      _id: e._id,
      examTitle: e.examTitle,
      subjectName: e.subjectId?.name || 'Subject',
      grade: e.grade,
      totalObtained: e.totalObtained,
      maxMarks: e.maxMarks,
      percentage: e.percentage,
      remarks: e.remarks || '',
    }));

    const avgPct = academicsData.length > 0
      ? Math.round(academicsData.reduce((s, a) => s + (a.percentage || 0), 0) / academicsData.length)
      : 0;
    const academicAverage = avgPct > 0
      ? `${avgPct >= 90 ? 'A+' : avgPct >= 80 ? 'A' : avgPct >= 70 ? 'B' : 'C'} (${avgPct}%)`
      : 'N/A';

    // 4. Real Timetable Query
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayDay = days[new Date().getDay()];

    let rawTimetable = [];
    if (gradeId && sectionId) {
      rawTimetable = await Timetable.find({
        schoolId,
        gradeId,
        sectionId,
        dayOfWeek: todayDay,
        status: 'ACTIVE',
      })
        .populate('subjectId', 'name code')
        .populate('teacherId', 'firstName lastName')
        .populate('periodId', 'name startTime endTime periodType')
        .sort({ 'periodId.startTime': 1 });

      if (rawTimetable.length === 0) {
        // Use Monday or all active days for this class if weekend/empty today
        rawTimetable = await Timetable.find({
          schoolId,
          gradeId,
          sectionId,
          status: 'ACTIVE',
        })
          .populate('subjectId', 'name code')
          .populate('teacherId', 'firstName lastName')
          .populate('periodId', 'name startTime endTime periodType')
          .sort({ 'periodId.startTime': 1 })
          .limit(6);
      }
    }

    const timetable = rawTimetable.map((t) => ({
      _id: t._id,
      startTime: t.periodId?.startTime || '09:00 AM',
      endTime: t.periodId?.endTime || '09:45 AM',
      subjectName: t.subjectId?.name || 'Subject',
      teacherName: t.teacherId ? `${t.teacherId.firstName} ${t.teacherId.lastName}` : 'Assigned Faculty',
      roomNumber: t.roomNumber || `Room ${sectionName.slice(-1) || '1'}01`,
    }));

    // 5. Real Published Announcements
    const announcements = await Announcement.find({
      schoolId,
      status: 'PUBLISHED',
    })
      .sort({ publishAt: -1, createdAt: -1 })
      .limit(5)
      .lean();

    const summary = {
      attendancePercentage,
      feeBalance: outstandingAmount,
      academicAverage,
      upcomingExam: announcements[0]?.title || 'Mid-Term Assessment',
      upcomingExamDate: announcements[0]?.publishAt ? new Date(announcements[0].publishAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Upcoming',
    };

    const studentInfo = {
      _id: targetChild._id,
      firstName: targetChild.firstName,
      lastName: targetChild.lastName,
      admissionNumber: targetChild.admissionNumber,
      gradeName: targetChild.gradeName,
      sectionName: targetChild.sectionName,
    };

    const attendanceData = {
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      leave: leaveCount,
      percentage: attendancePercentage,
      records: formattedAttendanceRecords,
    };

    const feesData = {
      totalAmount,
      paidAmount,
      outstandingAmount,
      overdue: overdueCount,
      invoices,
    };

    return successResponse(
      res,
      {
        student: studentInfo,
        summary,
        attendance: attendanceData,
        fees: feesData,
        academics: academicsData,
        timetable,
        announcements,
      },
      'Parent dashboard loaded successfully'
    );
  } catch (error) {
    next(error);
  }
};

const getChildAttendance = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { studentId } = req.params;

    const children = await getParentChildrenInternal(schoolId, req.user);
    const isOwner = children.some((c) => String(c._id) === String(studentId) || String(c.student?._id) === String(studentId));
    if (!isOwner) {
      return errorResponse(res, 'Unauthorized access to student record', 403, 'FORBIDDEN');
    }

    const records = await AttendanceRecord.find({ schoolId, studentId })
      .populate('statusId', 'code name category')
      .sort({ date: -1 })
      .lean();

    return successResponse(res, records, 'Child attendance records loaded');
  } catch (error) {
    next(error);
  }
};

const getChildFees = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { studentId } = req.params;

    const children = await getParentChildrenInternal(schoolId, req.user);
    const isOwner = children.some((c) => String(c._id) === String(studentId) || String(c.student?._id) === String(studentId));
    if (!isOwner) {
      return errorResponse(res, 'Unauthorized access to student record', 403, 'FORBIDDEN');
    }

    const [invoices, payments] = await Promise.all([
      Invoice.find({ schoolId, studentId, status: { $ne: 'CANCELLED' } }).sort({ invoiceDate: -1, createdAt: -1 }).lean(),
      Payment.find({ schoolId, studentId, status: 'SUCCESS' }).sort({ paymentDate: -1 }).lean(),
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
  getChildFees,
};
