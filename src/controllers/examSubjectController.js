const ExamService = require('../services/examService');
const MarksEntryService = require('../services/marksEntryService');
const pdfReportCardService = require('../services/pdfReportCardService');
const gradingSchemeService = require('../services/gradingSchemeService');
const { computeResultRow } = require('../services/resultCalculationService');
const examRepository = require('../repositories/examRepository');
const School = require('../models/School');
const { successResponse } = require('../utils/response');
const { logAuditEvent } = require('../middleware/auditLogger');

const audit = (req, action, entityId, extra = {}) => {
  logAuditEvent({
    schoolId: req.schoolContext?.schoolId,
    actorId: req.user?._id,
    actorName: req.user?.name,
    actorEmail: req.user?.email,
    action,
    entity: 'ExamSubject',
    entityId: String(entityId),
    requestId: req.requestId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    ...extra,
  });
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

const getMarksGrid = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const data = await MarksEntryService.getMarksGrid(schoolId, id);
    return successResponse(res, data, 'Marks grid retrieved');
  } catch (error) {
    next(error);
  }
};

const saveMarksBatch = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const { rows } = req.body;
    const result = await MarksEntryService.saveMarksBatch(schoolId, id, userId, rows);
    audit(req, 'MARKS_SAVED', id, {
      newValues: { savedCount: result.saved.length, conflictCount: result.conflicts.length },
    });
    return successResponse(res, result, 'Marks saved');
  } catch (error) {
    next(error);
  }
};

const verifyMarks = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const examSubject = await MarksEntryService.verifyExamSubjectMarks(schoolId, id, userId);
    audit(req, 'MARKS_VERIFIED', id);
    return successResponse(res, examSubject, 'Marks verified');
  } catch (error) {
    next(error);
  }
};

// Computes a display grade per mark-sheet row. A row with no marks entered
// yet (marksObtained still null in the grid) gets 'N/A' rather than being
// forced through computeResultRow, which would otherwise divide null by
// maxMarks and produce garbage.
const computeRowGrade = (row, examSubject, thresholds) => {
  if (row.isAbsent) return 'AB';
  if (row.isExempted) return 'EX';
  if (row.marksObtained === null || row.marksObtained === undefined) return 'N/A';
  const computed = computeResultRow({ marksObtained: row.marksObtained, isAbsent: false, isExempted: false }, examSubject, thresholds);
  return computed.grade;
};

const downloadMarkSheetPdf = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const [school, grid, thresholds] = await Promise.all([
      School.findById(schoolId).lean(),
      MarksEntryService.getMarksGrid(schoolId, id),
      gradingSchemeService.getThresholds(schoolId),
    ]);

    const examSubject = grid.examSubject;
    const exam = await examRepository.findExamById(schoolId, examSubject.examId);

    const schoolInfo = { name: school?.name || '', address: school?.address || '' };
    const examSubjectInfo = {
      examTitle: exam?.title || '',
      subjectName: examSubject?.subjectId?.name || '',
      gradeName: examSubject?.gradeId?.name || '',
      maxMarks: grid.maxMarks,
      passMarks: grid.passMarks,
      hasTheoryPractical: !!examSubject?.hasTheoryPractical,
      theoryMaxMarks: examSubject?.theoryMaxMarks,
      practicalMaxMarks: examSubject?.practicalMaxMarks,
    };

    const rows = grid.rows.map((row) => ({
      ...row,
      grade: computeRowGrade(row, examSubject, thresholds),
    }));

    pdfReportCardService.streamMarkSheetPdf(res, schoolInfo, examSubjectInfo, rows);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExamSubjects,
  getMarksGrid,
  saveMarksBatch,
  verifyMarks,
  downloadMarkSheetPdf,
};
