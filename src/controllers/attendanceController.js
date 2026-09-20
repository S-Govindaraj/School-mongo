const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceStatus = require('../models/AttendanceStatus');
const AttendanceAudit = require('../models/AttendanceAudit');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const AcademicYear = require('../models/AcademicYear');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getAttendanceSessions = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { date, gradeId, sectionId, attendanceType = 'DAILY', page = 1, limit = 50 } = req.query;

    const query = { schoolId, status: { $ne: 'ARCHIVED' } };
    if (date) query.date = new Date(date);
    if (gradeId) query.gradeId = gradeId;
    if (sectionId) query.sectionId = sectionId;
    if (attendanceType) query.attendanceType = attendanceType;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [totalRecords, sessions] = await Promise.all([
      AttendanceSession.countDocuments(query),
      AttendanceSession.find(query)
        .populate('academicYearId', 'name code')
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code room')
        .populate('periodId', 'name code sequence startTime endTime')
        .populate('subjectId', 'name code shortName')
        .populate('teacherId', 'firstName lastName employeeId')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    const formatted = sessions.map((s) => ({ ...s, id: String(s._id) }));
    return res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createAttendanceSession = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, date, gradeId, sectionId, periodId, subjectId, teacherId, attendanceType = 'DAILY' } = req.body;

    const sessionDate = new Date(date);

    // Find existing session or create new
    let session = await AttendanceSession.findOne({
      schoolId,
      academicYearId,
      date: sessionDate,
      sectionId,
      periodId: periodId || null,
      attendanceType,
      status: { $ne: 'ARCHIVED' },
    });

    if (!session) {
      session = await AttendanceSession.create({
        schoolId,
        academicYearId,
        date: sessionDate,
        gradeId,
        sectionId,
        periodId: periodId || null,
        subjectId: subjectId || null,
        teacherId: teacherId || null,
        attendanceType,
        status: 'SUBMITTED',
        startedAt: new Date(),
        completedAt: new Date(),
        markedBy: req.user?._id,
      });
    }

    return successResponse(res, session, 'Attendance session created/retrieved', 201);
  } catch (error) {
    next(error);
  }
};

const markBulkAttendance = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, date, gradeId, sectionId, periodId, attendanceType = 'DAILY', records = [] } = req.body;

    const sessionDate = new Date(date);

    // 1. Get or create session
    let session = await AttendanceSession.findOne({
      schoolId,
      academicYearId,
      date: sessionDate,
      sectionId,
      periodId: periodId || null,
      attendanceType,
      status: { $ne: 'ARCHIVED' },
    });

    if (session && session.status === 'LOCKED') {
      throw new ValidationError('This record is locked and cannot be modified.');
    }

    if (!session) {
      session = await AttendanceSession.create({
        schoolId,
        academicYearId,
        date: sessionDate,
        gradeId,
        sectionId,
        periodId: periodId || null,
        attendanceType,
        status: 'SUBMITTED',
        startedAt: new Date(),
        completedAt: new Date(),
        markedBy: req.user?._id,
      });
    }

    // Cache attendance statuses to check required reasons
    const allStatuses = await AttendanceStatus.find({ schoolId });
    const statusMap = new Map(allStatuses.map((s) => [String(s._id), s]));

    // Pre-fetch all enrollments for the submitted students in one query (eliminates N+1)
    const submittedStudentIds = records.map((r) => r.studentId);
    const activeEnrollments = await Enrollment.find({
      schoolId,
      studentId: { $in: submittedStudentIds },
      gradeId,
      sectionId,
      academicYearId,
      status: { $in: ['ENROLLED', 'ACTIVE'] },
    });
    const enrollmentMap = new Map(activeEnrollments.map((e) => [String(e.studentId), e]));

    // 2. Process records idempotently using bulkWrite
    const bulkOps = [];
    for (const item of records) {
      const { studentId, enrollmentId, statusId, remarks } = item;

      // Validate student enrollment using pre-fetched map (zero extra DB queries)
      const activeEnrollment = enrollmentMap.get(String(studentId));
      if (!activeEnrollment) {
        throw new ValidationError(`Student ${studentId} is not enrolled in this section for the selected academic year.`);
      }

      // Check if status requires a reason
      const statusDoc = statusMap.get(String(statusId));
      if (statusDoc && (statusDoc.requiresReason || ['EXCUSED', 'LEAVE'].includes(statusDoc.code))) {
        if (!remarks || !String(remarks).trim()) {
          throw new ValidationError(`A reason is required when marking attendance as ${statusDoc.name || statusDoc.code}.`);
        }
      }

      bulkOps.push({
        updateOne: {
          filter: {
            schoolId,
            attendanceSessionId: session._id,
            studentId,
          },
          update: {
            $set: {
              schoolId,
              attendanceSessionId: session._id,
              academicYearId,
              studentId,
              enrollmentId: enrollmentId || activeEnrollment._id,
              gradeId,
              sectionId,
              date: sessionDate,
              periodId: periodId || null,
              statusId,
              markedBy: req.user?._id,
              markedAt: new Date(),
              remarks: String(remarks || '').trim(),
              source: 'BULK',
            },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) {
      await AttendanceRecord.bulkWrite(bulkOps);
    }

    session.status = 'SUBMITTED';
    session.completedAt = new Date();
    await session.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'MARK',
      entity: 'AttendanceSession',
      entityId: session._id.toString(),
      details: { totalRecords: records.length, date, sectionId },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, { sessionId: session._id, count: records.length }, 'Attendance marked successfully');
  } catch (error) {
    next(error);
  }
};

const correctAttendanceRecord = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const { newStatusId, statusId, reason } = req.body;

    const targetStatusId = newStatusId || statusId;

    if (!reason || !String(reason).trim()) {
      throw new ValidationError('A mandatory reason is required to correct attendance records.');
    }

    const record = await AttendanceRecord.findOne({ _id: id, schoolId });
    if (!record) throw new NotFoundError('Attendance record not found');

    const previousStatusId = record.statusId;

    // Record audit entry
    await AttendanceAudit.create({
      schoolId,
      attendanceRecordId: record._id,
      previousStatusId,
      newStatusId: targetStatusId,
      reason: String(reason).trim(),
      editedBy: req.user._id,
      timestamp: new Date(),
      ipAddress: req.ip,
      requestId: req.requestId || '',
    });

    // Update attendance record
    record.statusId = targetStatusId;
    record.remarks = `Corrected: ${String(reason).trim()}`;
    record.markedBy = req.user._id;
    record.markedAt = new Date();
    await record.save();

    await logAuditEvent(req, 'ATTENDANCE_CORRECT', 'AttendanceRecord', record._id, { statusId: previousStatusId }, { statusId: targetStatusId, reason });

    return successResponse(res, record, 'Attendance record corrected successfully');
  } catch (error) {
    next(error);
  }
};

const getStudentAttendanceSummary = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    let targetAY = academicYearId;
    if (!targetAY) {
      const activeAY = await AcademicYear.findOne({ schoolId, isCurrent: true, status: 'ACTIVE' });
      targetAY = activeAY?._id;
    }

    const records = await AttendanceRecord.find({
      schoolId,
      studentId,
      academicYearId: targetAY,
    })
      .populate('statusId', 'name code countsAsPresent countsAsAbsent colorToken')
      .populate('periodId', 'name sequence')
      .sort({ date: -1 })
      .lean();

    const totalDays = records.length;
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;

    for (const r of records) {
      if (r.statusId?.countsAsPresent) presentCount++;
      if (r.statusId?.countsAsAbsent) absentCount++;
      if (r.statusId?.code === 'LATE') lateCount++;
      if (r.statusId?.code === 'EXCUSED' || r.statusId?.code === 'LEAVE') excusedCount++;
    }

    const pct = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 100;

    return successResponse(res, {
      studentId,
      academicYearId: targetAY,
      totalDays,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      attendancePercentage: pct,
      records: records.map((r) => ({ ...r, id: String(r._id) })),
    }, 'Student attendance summary retrieved');
  } catch (error) {
    next(error);
  }
};

const getSectionAttendanceSummary = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { sectionId } = req.params;
    const { date } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const activeEnrollments = await Enrollment.find({
      schoolId,
      sectionId,
      isCurrent: true,
      status: { $ne: 'ARCHIVED' },
    })
      .populate('studentId', 'firstName lastName studentNumber admissionNumber photo status')
      .lean();

    const studentIds = activeEnrollments.map((e) => e.studentId?._id || e.studentId);

    const records = await AttendanceRecord.find({
      schoolId,
      sectionId,
      date: targetDate,
      studentId: { $in: studentIds },
    })
      .populate('statusId', 'name code countsAsPresent countsAsAbsent colorToken')
      .lean();

    const recordMap = {};
    for (const r of records) {
      recordMap[String(r.studentId)] = r;
    }

    const studentAttendanceList = activeEnrollments.map((e) => {
      const student = e.studentId || {};
      const record = recordMap[String(student._id || student.id)];

      return {
        studentId: String(student._id || student.id),
        studentNumber: student.studentNumber,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        photo: student.photo,
        enrollmentId: String(e._id || e.id),
        gradeId: String(e.gradeId),
        sectionId: String(e.sectionId),
        recordId: record ? String(record._id) : null,
        statusId: record?.statusId?._id || null,
        statusCode: record?.statusId?.code || 'UNMARKED',
        statusName: record?.statusId?.name || 'Unmarked',
        colorToken: record?.statusId?.colorToken || 'gray',
        remarks: record?.remarks || '',
      };
    });

    return successResponse(res, {
      sectionId,
      date: targetDate,
      totalStudents: activeEnrollments.length,
      markedCount: records.length,
      students: studentAttendanceList,
    }, 'Section attendance list retrieved');
  } catch (error) {
    next(error);
  }
};

const getSchoolAttendanceSummary = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { date } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const [totalStudents, todayRecords] = await Promise.all([
      Student.countDocuments({ schoolId, status: 'ACTIVE' }),
      AttendanceRecord.find({ schoolId, date: targetDate })
        .populate('statusId', 'code countsAsPresent countsAsAbsent')
        .lean(),
    ]);

    let presentToday = 0;
    let absentToday = 0;
    let lateToday = 0;

    for (const r of todayRecords) {
      if (r.statusId?.countsAsPresent) presentToday++;
      if (r.statusId?.countsAsAbsent) absentToday++;
      if (r.statusId?.code === 'LATE') lateToday++;
    }

    const pct = totalStudents > 0 && todayRecords.length > 0
      ? Math.round((presentToday / todayRecords.length) * 100)
      : 100;

    return successResponse(res, {
      totalStudents,
      markedToday: todayRecords.length,
      presentToday,
      absentToday,
      lateToday,
      attendancePercentage: pct,
    }, 'School attendance summary retrieved');
  } catch (error) {
    next(error);
  }
};

const getAttendanceRecords = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { attendanceSessionId, date, studentId, gradeId, sectionId, page = 1, limit = 50 } = req.query;

    const query = { schoolId };
    if (attendanceSessionId) query.attendanceSessionId = attendanceSessionId;
    if (date) {
      const d = new Date(date);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }
    if (studentId) query.studentId = studentId;
    if (gradeId) query.gradeId = gradeId;
    if (sectionId) query.sectionId = sectionId;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [totalRecords, records] = await Promise.all([
      AttendanceRecord.countDocuments(query),
      AttendanceRecord.find(query)
        .populate('studentId', 'firstName lastName studentNumber admissionNumber')
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .populate('statusId', 'name code countsAsPresent countsAsAbsent colorToken')
        .populate('periodId', 'name startTime endTime')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    const formatted = records.map((r) => ({ ...r, id: String(r._id) }));
    return res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAttendanceSessions,
  createAttendanceSession,
  markBulkAttendance,
  getAttendanceRecords,
  correctAttendanceRecord,
  getStudentAttendanceSummary,
  getSectionAttendanceSummary,
  getSchoolAttendanceSummary,
};
