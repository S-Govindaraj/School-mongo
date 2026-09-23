const examRepository = require('../repositories/examRepository');
const { computeResultRow } = require('./resultCalculationService');
const gradingSchemeService = require('./gradingSchemeService');
const Enrollment = require('../models/Enrollment');
const ExamResult = require('../models/ExamResult');
const { NotFoundError, ValidationError } = require('../utils/errors');

const requireExam = async (schoolId, examId) => {
  const exam = await examRepository.findExamById(schoolId, examId);
  if (!exam) {
    throw new NotFoundError('Exam not found');
  }
  return exam;
};

class ResultService {
  // Readiness gate + status transition only — does NOT write ExamResult rows.
  // That only happens on publish().
  static async calculateResults(schoolId, examId) {
    const exam = await requireExam(schoolId, examId);
    const examSubjects = await examRepository.listExamSubjects(schoolId, examId, {});

    const unverified = examSubjects.filter((es) => !es.marksVerifiedAt);
    if (unverified.length > 0) {
      await examRepository.updateExam(schoolId, examId, { status: 'RESULTS_PENDING' });
      return {
        ready: false,
        errors: unverified.map((es) => ({
          examSubjectId: String(es._id),
          gradeId: es.gradeId?._id ? String(es.gradeId._id) : String(es.gradeId),
          subjectId: es.subjectId?._id ? String(es.subjectId._id) : String(es.subjectId),
          reason: 'Marks not verified',
        })),
      };
    }

    await examRepository.updateExam(schoolId, examId, { status: 'RESULTS_READY' });
    return { ready: true };
  }

  // Writes/upserts ExamResult rows for every StudentMark of every ExamSubject
  // in this exam, resolving each student's CURRENT section via Enrollment
  // (never the possibly-stale denormalized StudentMark.sectionId).
  static async publishResults(schoolId, examId, userId) {
    const exam = await requireExam(schoolId, examId);
    if (exam.status !== 'RESULTS_READY') {
      throw new ValidationError('Results can only be published once the exam status is RESULTS_READY.');
    }

    // exam came from requireExam()/findExamById(), which populates academicYearId
    // and academicTermId (.lean() docs) — resolve back to raw ObjectIds before
    // writing them onto ExamResult.
    const academicYearId = exam.academicYearId?._id || exam.academicYearId;
    const academicTermId = exam.academicTermId?._id || exam.academicTermId || undefined;

    // Resolved once per publish call (not per-row) and reused for every row.
    const thresholds = await gradingSchemeService.getThresholds(schoolId);

    const examSubjects = await examRepository.listExamSubjects(schoolId, examId, {});
    let publishedCount = 0;
    const skipped = [];

    for (const examSubject of examSubjects) {
      // eslint-disable-next-line no-await-in-loop
      const marks = await examRepository.listStudentMarksForExamSubject(schoolId, examSubject._id);

      for (const mark of marks) {
        // eslint-disable-next-line no-await-in-loop
        const enrollment = await Enrollment.findOne({ schoolId, studentId: mark.studentId, isCurrent: true }).lean();
        if (!enrollment) {
          skipped.push({ studentId: String(mark.studentId), reason: 'No current enrollment found' });
          continue;
        }

        const computed = computeResultRow(mark, examSubject, thresholds);

        // eslint-disable-next-line no-await-in-loop
        await ExamResult.findOneAndUpdate(
          { schoolId, examSubjectId: mark.examSubjectId, studentId: mark.studentId },
          {
            $set: {
              schoolId,
              studentId: mark.studentId,
              academicYearId,
              academicTermId,
              gradeId: enrollment.gradeId,
              sectionId: enrollment.sectionId,
              subjectId: examSubject.subjectId?._id || examSubject.subjectId,
              examTitle: exam.title,
              examType: exam.examType,
              maxMarks: examSubject.maxMarks,
              ...computed,
              status: 'PUBLISHED',
              publishedAt: new Date(),
              examId,
              examSubjectId: mark.examSubjectId,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        publishedCount += 1;
      }
    }

    await examRepository.updateExam(schoolId, examId, {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      publishedBy: userId,
    });

    return { publishedCount, skipped };
  }

  static async lockExam(schoolId, examId, userId) {
    const exam = await requireExam(schoolId, examId);
    if (exam.status !== 'PUBLISHED') {
      throw new ValidationError('Only a PUBLISHED exam can be locked.');
    }
    return examRepository.updateExam(schoolId, examId, {
      status: 'LOCKED',
      lockedAt: new Date(),
      lockedBy: userId,
    });
  }

  static async unlockExam(schoolId, examId, userId, reason) {
    if (!reason || !String(reason).trim()) {
      throw new ValidationError('A reason is required to unlock a locked exam.');
    }
    const exam = await requireExam(schoolId, examId);
    if (exam.status !== 'LOCKED') {
      throw new ValidationError('Only a LOCKED exam can be unlocked.');
    }
    return examRepository.updateExam(schoolId, examId, {
      status: 'PUBLISHED',
      lockedAt: null,
      lockedBy: null,
    });
  }
}

module.exports = ResultService;
