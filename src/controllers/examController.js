const ExamService = require('../services/examService');
const ExamScheduleService = require('../services/examScheduleService');
const ResultService = require('../services/resultService');
const { successResponse } = require('../utils/response');
const { logAuditEvent } = require('../middleware/auditLogger');

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

const getExams = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const data = await ExamService.listExams(schoolId, req.query);
    return successResponse(res, data, 'Exams retrieved');
  } catch (error) {
    next(error);
  }
};

const getExamById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const data = await ExamService.getExamById(schoolId, id);
    return successResponse(res, data, 'Exam retrieved');
  } catch (error) {
    next(error);
  }
};

const createExam = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const exam = await ExamService.createExam(schoolId, userId, req.body);
    audit(req, 'CREATE', exam._id, { newValues: exam.toObject ? exam.toObject() : exam });
    return successResponse(res, exam, 'Exam created', 201);
  } catch (error) {
    next(error);
  }
};

const updateExam = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const exam = await ExamService.updateExam(schoolId, id, req.body);
    audit(req, 'UPDATE', id, { newValues: req.body });
    return successResponse(res, exam, 'Exam updated');
  } catch (error) {
    next(error);
  }
};

const archiveExam = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const result = await ExamService.archiveExam(schoolId, id);
    audit(req, 'DELETE', id);
    return successResponse(res, result, 'Exam deleted');
  } catch (error) {
    next(error);
  }
};

const getExamSubjects = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { examId } = req.params;
    const { gradeId } = req.query;
    const data = await ExamService.listExamSubjects(schoolId, examId, { gradeId });
    return successResponse(res, data, 'Exam subjects retrieved');
  } catch (error) {
    next(error);
  }
};

const setExamSubjects = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { examId } = req.params;
    const { gradeId, subjects } = req.body;
    const data = await ExamService.setExamSubjects(schoolId, examId, gradeId, subjects);
    audit(req, 'SUBJECTS_CONFIGURED', examId, { newValues: { gradeId, subjectCount: subjects.length } });
    return successResponse(res, data, 'Exam subjects saved');
  } catch (error) {
    next(error);
  }
};

const confirmSchedule = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const exam = await ExamScheduleService.confirmSchedule(schoolId, id);
    audit(req, 'SCHEDULE_CONFIRMED', id);
    return successResponse(res, exam, 'Exam schedule confirmed');
  } catch (error) {
    next(error);
  }
};

const startExam = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const exam = await ExamScheduleService.startExam(schoolId, id);
    audit(req, 'STARTED', id);
    return successResponse(res, exam, 'Exam started');
  } catch (error) {
    next(error);
  }
};

const completeExam = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const exam = await ExamScheduleService.completeExam(schoolId, id);
    audit(req, 'COMPLETED', id);
    return successResponse(res, exam, 'Exam completed');
  } catch (error) {
    next(error);
  }
};

const lockExam = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const exam = await ResultService.lockExam(schoolId, id, userId);
    audit(req, 'LOCKED', id);
    return successResponse(res, exam, 'Exam locked');
  } catch (error) {
    next(error);
  }
};

const unlockExam = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const { reason } = req.body;
    const exam = await ResultService.unlockExam(schoolId, id, userId, reason);
    audit(req, 'UNLOCKED', id, { reason });
    return successResponse(res, exam, 'Exam unlocked');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExams,
  getExamById,
  createExam,
  updateExam,
  archiveExam,
  getExamSubjects,
  setExamSubjects,
  confirmSchedule,
  startExam,
  completeExam,
  lockExam,
  unlockExam,
};
