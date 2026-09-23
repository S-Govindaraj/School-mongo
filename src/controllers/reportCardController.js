const reportCardService = require('../services/reportCardService');
const pdfReportCardService = require('../services/pdfReportCardService');
const gradingSchemeService = require('../services/gradingSchemeService');
const Student = require('../models/Student');
const School = require('../models/School');
const Enrollment = require('../models/Enrollment');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');

// This is a NEW resource under /students/:studentId/... — not covered by any
// existing Student 360 tenant check, so it re-verifies the student belongs
// to this school itself.
const requireStudent = async (schoolId, studentId) => {
  const student = await Student.findOne({ _id: studentId, schoolId }).lean();
  if (!student) {
    throw new NotFoundError('Student not found');
  }
  return student;
};

const getReportCard = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { academicYearId, academicTermId } = req.query;
    if (!academicYearId) {
      throw new ValidationError('academicYearId is required');
    }

    await requireStudent(schoolId, studentId);
    const data = await reportCardService.generateReportCard(schoolId, studentId, academicYearId, academicTermId);
    return successResponse(res, data, 'Report card retrieved');
  } catch (error) {
    next(error);
  }
};

// Everything that can fail with a JSON error response (tenant check, data
// aggregation, thresholds lookup, school/enrollment lookups) happens BEFORE
// pdfReportCardService.streamReportCardPdf is called. Only once that call
// sets response headers and starts piping does the standard PDF-streaming
// caveat apply: a failure from that point on can no longer become a clean
// JSON error response.
const downloadReportCardPdf = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId } = req.params;
    const { academicYearId, academicTermId } = req.query;
    if (!academicYearId) {
      throw new ValidationError('academicYearId is required');
    }

    const student = await requireStudent(schoolId, studentId);
    const [school, enrollment, reportCard, thresholds] = await Promise.all([
      School.findById(schoolId).lean(),
      Enrollment.findOne({ schoolId, studentId, isCurrent: true }).populate('gradeId', 'name').populate('sectionId', 'name').lean(),
      reportCardService.generateReportCard(schoolId, studentId, academicYearId, academicTermId),
      gradingSchemeService.getThresholds(schoolId),
    ]);

    const schoolInfo = { name: school?.name || '', address: school?.address || '' };
    const studentInfo = {
      name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      admissionNumber: student.admissionNumber || '',
      gradeName: enrollment?.gradeId?.name || '',
      sectionName: enrollment?.sectionId?.name || '',
    };

    pdfReportCardService.streamReportCardPdf(res, schoolInfo, studentInfo, reportCard, thresholds);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReportCard,
  downloadReportCardPdf,
};
