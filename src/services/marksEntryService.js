const examRepository = require('../repositories/examRepository');
const { NotFoundError, ValidationError } = require('../utils/errors');

const requireExamSubject = async (schoolId, examSubjectId) => {
  const examSubject = await examRepository.findExamSubjectById(schoolId, examSubjectId);
  if (!examSubject) {
    throw new NotFoundError('Exam subject not found');
  }
  return examSubject;
};

const requireExam = async (schoolId, examId) => {
  const exam = await examRepository.findExamById(schoolId, examId);
  if (!exam) {
    throw new NotFoundError('Exam not found');
  }
  return exam;
};

class MarksEntryService {
  // Resolves the ExamSubject, the students currently enrolled in its grade
  // (via Enrollment.isCurrent — the confirmed single source of truth), and
  // any existing StudentMark rows, then left-joins them in memory so every
  // enrolled student appears in the grid even before any mark has been saved.
  static async getMarksGrid(schoolId, examSubjectId) {
    const examSubject = await requireExamSubject(schoolId, examSubjectId);

    const [enrollments, marks] = await Promise.all([
      examRepository.getEnrolledStudentsForGrade(schoolId, examSubject.academicYearId, examSubject.gradeId?._id || examSubject.gradeId),
      examRepository.listStudentMarksForExamSubject(schoolId, examSubjectId),
    ]);

    const markByStudent = {};
    marks.forEach((m) => { markByStudent[String(m.studentId)] = m; });

    const rows = enrollments
      .filter((e) => e.studentId)
      .map((e) => {
        const student = e.studentId;
        const mark = markByStudent[String(student._id)];
        return {
          studentId: String(student._id),
          studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
          rollNumber: student.studentNumber || student.admissionNumber || null,
          marksObtained: mark && mark.marksObtained !== undefined ? mark.marksObtained : null,
          theoryMarksObtained: mark && mark.theoryMarksObtained !== undefined ? mark.theoryMarksObtained : null,
          practicalMarksObtained: mark && mark.practicalMarksObtained !== undefined ? mark.practicalMarksObtained : null,
          isAbsent: mark?.isAbsent || false,
          isExempted: mark?.isExempted || false,
          remarks: mark?.remarks || '',
          version: mark?.version || 0,
        };
      });

    return {
      examSubject,
      maxMarks: examSubject.maxMarks,
      passMarks: examSubject.passMarks,
      rows,
    };
  }

  // rows: [{studentId, marksObtained?, isAbsent?, isExempted?, remarks?, version?}]
  // Validation is all-or-nothing (throws before writing anything) — this is
  // distinct from the per-row optimistic-concurrency conflicts returned by
  // the repository, which are partial (some rows save, others report conflict).
  static async saveMarksBatch(schoolId, examSubjectId, userId, rows) {
    const examSubject = await requireExamSubject(schoolId, examSubjectId);
    const exam = await requireExam(schoolId, examSubject.examId);

    if (exam.status === 'LOCKED') {
      throw new ValidationError('Exam is locked');
    }
    if (!rows || rows.length < 1) {
      throw new ValidationError('At least one row is required.');
    }

    const isSplit = !!examSubject.hasTheoryPractical;

    const errors = [];
    rows.forEach((row) => {
      const hasTheoryOrPractical = (row.theoryMarksObtained !== undefined && row.theoryMarksObtained !== null)
        || (row.practicalMarksObtained !== undefined && row.practicalMarksObtained !== null);
      const hasFlatMarks = row.marksObtained !== undefined && row.marksObtained !== null;
      const isPresentRow = !(row.isAbsent === true) && !(row.isExempted === true);

      if (!isSplit && hasTheoryOrPractical) {
        errors.push({ studentId: row.studentId, reason: 'theoryMarksObtained/practicalMarksObtained are not accepted for a subject without a theory/practical split.' });
        return;
      }

      if (isSplit && isPresentRow) {
        // Split subject, present row: must supply BOTH theory and practical, not the flat total.
        const flagCount = [hasTheoryOrPractical, row.isAbsent === true, row.isExempted === true].filter(Boolean).length;
        if (hasFlatMarks) {
          errors.push({ studentId: row.studentId, reason: 'marksObtained must not be sent directly for a theory/practical split subject; send theoryMarksObtained and practicalMarksObtained instead.' });
          return;
        }
        if (flagCount !== 1 || row.theoryMarksObtained === undefined || row.theoryMarksObtained === null
          || row.practicalMarksObtained === undefined || row.practicalMarksObtained === null) {
          errors.push({ studentId: row.studentId, reason: 'Both theoryMarksObtained and practicalMarksObtained must be set (or exactly one of isAbsent/isExempted).' });
          return;
        }
        if (row.theoryMarksObtained < 0 || row.theoryMarksObtained > examSubject.theoryMaxMarks) {
          errors.push({ studentId: row.studentId, reason: `theoryMarksObtained must be between 0 and ${examSubject.theoryMaxMarks}.` });
        }
        if (row.practicalMarksObtained < 0 || row.practicalMarksObtained > examSubject.practicalMaxMarks) {
          errors.push({ studentId: row.studentId, reason: `practicalMarksObtained must be between 0 and ${examSubject.practicalMaxMarks}.` });
        }
        return;
      }

      // Non-split subject (or an absent/exempted row on a split subject): unchanged behavior.
      const flagCount = [hasFlatMarks, row.isAbsent === true, row.isExempted === true].filter(Boolean).length;
      if (flagCount !== 1) {
        errors.push({ studentId: row.studentId, reason: 'Exactly one of marksObtained/isAbsent/isExempted must be set.' });
        return;
      }
      if (hasFlatMarks && (row.marksObtained < 0 || row.marksObtained > examSubject.maxMarks)) {
        errors.push({ studentId: row.studentId, reason: `marksObtained must be between 0 and ${examSubject.maxMarks}.` });
      }
    });

    if (errors.length > 0) {
      throw new ValidationError('One or more mark rows are invalid.', errors);
    }

    // Editing marks after verification forces re-verification: clear
    // marksVerifiedAt/marksVerifiedBy on this ExamSubject as part of this save.
    if (examSubject.marksVerifiedAt) {
      await examRepository.clearExamSubjectVerification(schoolId, examSubjectId);
    }

    const repoRows = rows.map((row) => {
      const isPresentRow = !(row.isAbsent === true) && !(row.isExempted === true);
      const rowIsSplit = isSplit && isPresentRow
        && row.theoryMarksObtained !== undefined && row.theoryMarksObtained !== null
        && row.practicalMarksObtained !== undefined && row.practicalMarksObtained !== null;

      return {
        studentId: row.studentId,
        examId: examSubject.examId,
        gradeId: examSubject.gradeId?._id || examSubject.gradeId,
        sectionId: row.sectionId,
        subjectId: examSubject.subjectId?._id || examSubject.subjectId,
        marksObtained: rowIsSplit ? (row.theoryMarksObtained + row.practicalMarksObtained) : row.marksObtained,
        theoryMarksObtained: rowIsSplit ? row.theoryMarksObtained : undefined,
        practicalMarksObtained: rowIsSplit ? row.practicalMarksObtained : undefined,
        isAbsent: row.isAbsent,
        isExempted: row.isExempted,
        remarks: row.remarks,
        expectedVersion: row.version,
        userId,
      };
    });

    const { savedStudentIds, conflicts } = await examRepository.bulkUpsertStudentMarks(schoolId, examSubjectId, repoRows);
    return { saved: savedStudentIds, conflicts };
  }

  // Fetches enrolled students + existing StudentMark rows and diffs them —
  // any enrolled student with NO StudentMark row at all (not even marked
  // absent/exempted) blocks verification.
  static async verifyExamSubjectMarks(schoolId, examSubjectId, userId) {
    const examSubject = await requireExamSubject(schoolId, examSubjectId);

    const [enrollments, marks] = await Promise.all([
      examRepository.getEnrolledStudentsForGrade(schoolId, examSubject.academicYearId, examSubject.gradeId?._id || examSubject.gradeId),
      examRepository.listStudentMarksForExamSubject(schoolId, examSubjectId),
    ]);

    const markedStudentIds = new Set(marks.map((m) => String(m.studentId)));
    const missing = enrollments
      .filter((e) => e.studentId && !markedStudentIds.has(String(e.studentId._id)))
      .map((e) => ({
        studentId: String(e.studentId._id),
        studentName: `${e.studentId.firstName || ''} ${e.studentId.lastName || ''}`.trim(),
        reason: 'No marks entered',
      }));

    if (missing.length > 0) {
      throw new ValidationError('Some students are missing marks', missing);
    }

    return examRepository.markExamSubjectVerified(schoolId, examSubjectId, userId);
  }
}

module.exports = MarksEntryService;
