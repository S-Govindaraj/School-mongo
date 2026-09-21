const Student360Service = require('../services/student360Service');
const { successResponse } = require('../utils/response');
const { logAuditEvent } = require('../middleware/auditLogger');

const auditView = (req, entity, studentId) => {
  logAuditEvent({
    schoolId: req.schoolContext?.schoolId,
    actorId: req.user?._id,
    actorName: req.user?.name,
    actorEmail: req.user?.email,
    action: 'VIEW',
    entity,
    entityId: String(studentId),
    requestId: req.requestId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
};

const getOverview = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const data = await Student360Service.getOverview(schoolId, studentId);
    return successResponse(res, data, 'Student overview retrieved');
  } catch (error) {
    next(error);
  }
};

const getAcademicJourney = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const data = await Student360Service.getAcademicJourney(schoolId, studentId);
    return successResponse(res, data, 'Academic journey retrieved');
  } catch (error) {
    next(error);
  }
};

const getYearDetail = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId, academicYearId } = req.params;
    const data = await Student360Service.getYearDetail(schoolId, studentId, academicYearId);
    return successResponse(res, data, 'Academic year detail retrieved');
  } catch (error) {
    next(error);
  }
};

const getSubjectsAndTeachers = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { academicYearId } = req.query;
    const data = await Student360Service.getSubjectsAndTeachers(schoolId, studentId, academicYearId);
    return successResponse(res, data, 'Subjects and teachers retrieved');
  } catch (error) {
    next(error);
  }
};

const getAttendance = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { academicYearId } = req.query;
    const data = await Student360Service.getAttendance(schoolId, studentId, academicYearId);
    auditView(req, 'Student360Attendance', studentId);
    return successResponse(res, data, 'Attendance retrieved');
  } catch (error) {
    next(error);
  }
};

const getExamsResults = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { academicYearId } = req.query;
    const data = await Student360Service.getExamsResults(schoolId, studentId, academicYearId);
    auditView(req, 'Student360Exams', studentId);
    return successResponse(res, data, 'Exam results retrieved');
  } catch (error) {
    next(error);
  }
};

const getPerformanceTrend = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const data = await Student360Service.getPerformanceTrend(schoolId, studentId);
    return successResponse(res, data, 'Performance trend retrieved');
  } catch (error) {
    next(error);
  }
};

const getFinance = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { academicYearId } = req.query;
    const data = await Student360Service.getFinance(schoolId, studentId, academicYearId);
    auditView(req, 'Student360Finance', studentId);
    return successResponse(res, data, 'Finance summary retrieved');
  } catch (error) {
    next(error);
  }
};

const getTimetable = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { academicYearId } = req.query;
    const data = await Student360Service.getTimetable(schoolId, studentId, academicYearId);
    return successResponse(res, data, 'Timetable retrieved');
  } catch (error) {
    next(error);
  }
};

const getGuardians = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const data = await Student360Service.getGuardians(schoolId, studentId);
    return successResponse(res, data, 'Guardians retrieved');
  } catch (error) {
    next(error);
  }
};

const getDocuments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const data = await Student360Service.getDocuments(schoolId, studentId);
    auditView(req, 'Student360Documents', studentId);
    return successResponse(res, data, 'Documents retrieved');
  } catch (error) {
    next(error);
  }
};

const getTransport = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { academicYearId } = req.query;
    const data = await Student360Service.getTransport(schoolId, studentId, academicYearId);
    return successResponse(res, data, 'Transport assignment retrieved');
  } catch (error) {
    next(error);
  }
};

const getTimeline = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const data = await Student360Service.getTimeline(schoolId, studentId);
    return successResponse(res, data, 'Timeline retrieved');
  } catch (error) {
    next(error);
  }
};

const getDiscipline = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const data = await Student360Service.getDiscipline(schoolId, studentId);
    auditView(req, 'Student360Discipline', studentId);
    return successResponse(res, data, 'Discipline records retrieved');
  } catch (error) {
    next(error);
  }
};

const getMedical = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const data = await Student360Service.getMedical(schoolId, studentId);
    auditView(req, 'Student360Medical', studentId);
    return successResponse(res, data, 'Medical records retrieved');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverview,
  getAcademicJourney,
  getYearDetail,
  getSubjectsAndTeachers,
  getAttendance,
  getExamsResults,
  getPerformanceTrend,
  getFinance,
  getTimetable,
  getGuardians,
  getDocuments,
  getTransport,
  getTimeline,
  getDiscipline,
  getMedical,
};
