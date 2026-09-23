const resultCorrectionService = require('../services/resultCorrectionService');
const { successResponse } = require('../utils/response');
const { logAuditEvent } = require('../middleware/auditLogger');

const audit = (req, action, entityId, extra = {}) => {
  logAuditEvent({
    schoolId: req.schoolContext?.schoolId,
    actorId: req.user?._id,
    actorName: req.user?.name,
    actorEmail: req.user?.email,
    action,
    entity: 'ResultCorrection',
    entityId: String(entityId),
    requestId: req.requestId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    ...extra,
  });
};

const listCorrections = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { examId } = req.params;
    const { status } = req.query;
    const data = await resultCorrectionService.listCorrections(schoolId, { examId, status });
    return successResponse(res, data, 'Correction requests retrieved');
  } catch (error) {
    next(error);
  }
};

const requestCorrection = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { examId } = req.params;
    const { examSubjectId, studentId, reason, requestedValue } = req.body;

    const correction = await resultCorrectionService.requestCorrection(schoolId, userId, {
      examId, examSubjectId, studentId, reason, requestedValue,
    });

    audit(req, 'CORRECTION_REQUESTED', correction._id, {
      newValues: { examSubjectId, studentId, reason, requestedValue },
    });
    return successResponse(res, correction, 'Correction requested', 201);
  } catch (error) {
    next(error);
  }
};

const approveCorrection = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const correction = await resultCorrectionService.approveCorrection(schoolId, id, userId);
    audit(req, 'CORRECTION_APPROVED', id);
    return successResponse(res, correction, 'Correction approved and applied');
  } catch (error) {
    next(error);
  }
};

const rejectCorrection = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;
    const { reviewNotes } = req.body;
    const correction = await resultCorrectionService.rejectCorrection(schoolId, id, userId, reviewNotes);
    audit(req, 'CORRECTION_REJECTED', id, { reason: reviewNotes });
    return successResponse(res, correction, 'Correction rejected');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listCorrections,
  requestCorrection,
  approveCorrection,
  rejectCorrection,
};
