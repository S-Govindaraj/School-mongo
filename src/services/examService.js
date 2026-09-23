const examRepository = require('../repositories/examRepository');
const Grade = require('../models/Grade');
const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const { NotFoundError, ValidationError } = require('../utils/errors');

const requireExam = async (schoolId, examId) => {
  const exam = await examRepository.findExamById(schoolId, examId);
  if (!exam) {
    throw new NotFoundError('Exam not found');
  }
  return exam;
};

class ExamService {
  static async listExams(schoolId, filters) {
    return examRepository.listExams(schoolId, filters);
  }

  static async getExamById(schoolId, examId) {
    return requireExam(schoolId, examId);
  }

  // Re-verifies academicYearId/academicTermId/gradeIds all belong to schoolId
  // before creating — the caller (controller) is expected to have already
  // validated shape via examSchemas, but tenant-scoped existence is checked here.
  static async createExam(schoolId, userId, payload) {
    const { academicYearId, academicTermId, gradeIds, startDate, endDate } = payload;

    if (!gradeIds || gradeIds.length < 1) {
      throw new ValidationError('At least one grade is required.');
    }
    if (new Date(endDate) < new Date(startDate)) {
      throw new ValidationError('End date cannot be before start date.');
    }

    const [yearExists, gradeCount] = await Promise.all([
      AcademicYear.exists({ _id: academicYearId, schoolId }),
      Grade.countDocuments({ _id: { $in: gradeIds }, schoolId }),
    ]);
    if (!yearExists) {
      throw new ValidationError('Academic year not found for this school.');
    }
    if (gradeCount !== gradeIds.length) {
      throw new ValidationError('One or more grades were not found for this school.');
    }
    if (academicTermId) {
      const termExists = await AcademicTerm.exists({ _id: academicTermId, schoolId, academicYearId });
      if (!termExists) {
        throw new ValidationError('Academic term not found for this school/academic year.');
      }
    }

    return examRepository.createExam({
      ...payload,
      schoolId,
      status: 'DRAFT',
      createdBy: userId,
    });
  }

  static async updateExam(schoolId, examId, updates) {
    const exam = await requireExam(schoolId, examId);
    if (exam.status !== 'DRAFT') {
      throw new ValidationError('Exam can only be edited while in DRAFT status');
    }
    if (updates.startDate && updates.endDate && new Date(updates.endDate) < new Date(updates.startDate)) {
      throw new ValidationError('End date cannot be before start date.');
    }
    if (updates.gradeIds && updates.gradeIds.length < 1) {
      throw new ValidationError('At least one grade is required.');
    }
    return examRepository.updateExam(schoolId, examId, updates);
  }

  // Phase 1 rule: DRAFT-only hard delete. Once an exam leaves DRAFT (scheduled,
  // published, etc.) it must be locked/unlocked instead — never deleted.
  static async archiveExam(schoolId, examId) {
    const exam = await requireExam(schoolId, examId);
    if (exam.status !== 'DRAFT') {
      throw new ValidationError('Only DRAFT exams can be deleted. Scheduled or published exams must be locked instead.');
    }
    await examRepository.deleteExam(schoolId, examId);
    return { deleted: true };
  }

  static async setExamSubjects(schoolId, examId, gradeId, subjectRows) {
    const exam = await requireExam(schoolId, examId);
    if (!['DRAFT', 'SCHEDULED'].includes(exam.status)) {
      throw new ValidationError('Exam subjects can only be configured while the exam is DRAFT or SCHEDULED.');
    }
    if (!subjectRows || subjectRows.length < 1) {
      throw new ValidationError('At least one subject row is required.');
    }

    // exam came from requireExam()/findExamById(), which populates academicYearId
    // (.lean() doc) — resolve back to the raw ObjectId before using it as a filter
    // value or storing it on ExamSubject.
    const academicYearId = exam.academicYearId?._id || exam.academicYearId;

    const subjectIds = subjectRows.map((r) => r.subjectId);
    const defaults = await examRepository.findClassSubjectDefaults(schoolId, academicYearId, gradeId, subjectIds);
    const defaultsBySubject = {};
    defaults.forEach((d) => { defaultsBySubject[String(d.subjectId)] = d; });

    const rows = subjectRows.map((row) => {
      const fallback = defaultsBySubject[String(row.subjectId)];
      let maxMarks = row.maxMarks ?? fallback?.maxMarks ?? 100;
      let passMarks = row.passMarks ?? fallback?.passMarks ?? 35;

      if (row.hasTheoryPractical) {
        if (!(row.theoryMaxMarks > 0) || !(row.practicalMaxMarks > 0)) {
          throw new ValidationError(
            `Subject ${row.subjectId} has theory/practical split enabled but is missing a positive theoryMaxMarks/practicalMaxMarks.`
          );
        }
        maxMarks = row.theoryMaxMarks + row.practicalMaxMarks;
        if (row.theoryPassMarks !== undefined && row.practicalPassMarks !== undefined) {
          passMarks = row.theoryPassMarks + row.practicalPassMarks;
        }
      }

      return {
        schoolId,
        examId,
        academicYearId,
        gradeId,
        subjectId: row.subjectId,
        maxMarks,
        passMarks,
        hasTheoryPractical: !!row.hasTheoryPractical,
        theoryMaxMarks: row.hasTheoryPractical ? row.theoryMaxMarks : undefined,
        theoryPassMarks: row.hasTheoryPractical ? row.theoryPassMarks : undefined,
        practicalMaxMarks: row.hasTheoryPractical ? row.practicalMaxMarks : undefined,
        practicalPassMarks: row.hasTheoryPractical ? row.practicalPassMarks : undefined,
        examDate: row.examDate,
        startTime: row.startTime,
        endTime: row.endTime,
        durationMinutes: row.durationMinutes,
        room: row.room || '',
        invigilatorStaffId: row.invigilatorStaffId,
      };
    });

    await examRepository.upsertExamSubjects(schoolId, examId, rows);
    return examRepository.listExamSubjects(schoolId, examId, { gradeId });
  }

  static async listExamSubjects(schoolId, examId, filters) {
    await requireExam(schoolId, examId);
    return examRepository.listExamSubjects(schoolId, examId, filters);
  }
}

module.exports = ExamService;
