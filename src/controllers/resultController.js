const ResultService = require('../services/resultService');
const ExamService = require('../services/examService');
const ExamResult = require('../models/ExamResult');
const { createResultPublishedNotifications } = require('../services/examNotificationHelper');
const resultRepository = require('../repositories/resultRepository');
const { rankStudents } = require('../services/rankingService');
const { buildAnalytics } = require('../services/examAnalyticsService');
const { successResponse } = require('../utils/response');
const { logAuditEvent } = require('../middleware/auditLogger');
const logger = require('../config/logger');

const audit = (req, action, entityId, extra = {}) => {
  logAuditEvent({
    schoolId: req.schoolContext?.schoolId,
    actorId: req.user?._id,
    actorName: req.user?.name,
    actorEmail: req.user?.email,
    action,
    entity: 'Exam',
    entityId: String(entityId),
    requestId: req.requestId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    ...extra,
  });
};

const calculateResults = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const result = await ResultService.calculateResults(schoolId, id);
    audit(req, 'RESULTS_CALCULATED', id, { newValues: result });
    return successResponse(res, result, 'Result calculation completed');
  } catch (error) {
    next(error);
  }
};

const publishResults = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const result = await ResultService.publishResults(schoolId, id, userId);
    audit(req, 'RESULTS_PUBLISHED', id, { newValues: { publishedCount: result.publishedCount } });

    // Best-effort notification dispatch — must never fail the publish response.
    try {
      const exam = await ExamService.getExamById(schoolId, id);
      const publishedResults = await ExamResult.find({ schoolId, examId: id, status: 'PUBLISHED' })
        .select('studentId')
        .lean();
      const publishedStudentIds = [...new Set(publishedResults.map((r) => String(r.studentId)))];
      await createResultPublishedNotifications(schoolId, exam, publishedStudentIds);
    } catch (notifyError) {
      logger.error(`Failed to dispatch result-published notifications: ${notifyError.message}`);
    }

    return successResponse(res, result, 'Results published');
  } catch (error) {
    next(error);
  }
};

// Read-only — matches the existing convention for exam read endpoints
// (examController.getExams/getExamById) of not calling audit().
const getExamRankings = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id: examId } = req.params;
    const { gradeId, sectionId } = req.query;

    const results = await resultRepository.listExamResultsForExam(schoolId, examId, { gradeId, sectionId });

    const byStudent = {};
    results.forEach((r) => {
      const studentId = r.studentId?._id ? String(r.studentId._id) : String(r.studentId);
      if (!byStudent[studentId]) {
        byStudent[studentId] = {
          studentId,
          student: r.studentId,
          totalObtained: 0,
          percentageSum: 0,
          subjectCount: 0,
        };
      }
      byStudent[studentId].totalObtained += r.totalObtained || 0;
      byStudent[studentId].percentageSum += r.percentage || 0;
      byStudent[studentId].subjectCount += 1;
    });

    const studentTotals = Object.values(byStudent).map((s) => ({
      studentId: s.studentId,
      student: s.student,
      totalObtained: s.totalObtained,
      percentage: s.subjectCount > 0 ? Math.round((s.percentageSum / s.subjectCount) * 10) / 10 : 0,
      subjectCount: s.subjectCount,
    }));

    const ranked = rankStudents(studentTotals);

    return successResponse(res, ranked, 'Exam rankings retrieved');
  } catch (error) {
    next(error);
  }
};

// Read-only — matches the existing convention for exam read endpoints
// (getExamRankings, examController.getExams/getExamById) of not calling audit().
const getExamAnalytics = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id: examId } = req.params;
    const { gradeId, sectionId, subjectId } = req.query;

    const rows = await resultRepository.listExamResultsForExam(schoolId, examId, { gradeId, sectionId, subjectId });
    const analytics = buildAnalytics(rows);

    return successResponse(res, analytics, 'Exam analytics retrieved');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  calculateResults,
  publishResults,
  getExamRankings,
  getExamAnalytics,
};
