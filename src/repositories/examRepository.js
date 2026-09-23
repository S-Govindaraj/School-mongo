const Exam = require('../models/Exam');
const ExamSubject = require('../models/ExamSubject');
const StudentMark = require('../models/StudentMark');
const ClassSubject = require('../models/ClassSubject');
const Enrollment = require('../models/Enrollment');

// ---------------------------------------------------------------------------
// Exam
// ---------------------------------------------------------------------------

const listExams = async (schoolId, filters = {}) => {
  const {
    academicYearId, academicTermId, examType, gradeId, status, search,
    page = 1, limit = 50,
  } = filters;

  const query = { schoolId };
  if (academicYearId) query.academicYearId = academicYearId;
  if (academicTermId) query.academicTermId = academicTermId;
  if (examType) query.examType = examType;
  if (gradeId) query.gradeIds = gradeId;
  if (status) query.status = status;
  if (search && String(search).trim()) {
    query.title = { $regex: String(search).trim(), $options: 'i' };
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 50;
  const skip = (pageNum - 1) * limitNum;

  const [totalRecords, exams] = await Promise.all([
    Exam.countDocuments(query),
    Exam.find(query)
      .populate('academicYearId', 'name code')
      .populate('academicTermId', 'name code')
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  return { exams, totalRecords };
};

const findExamById = (schoolId, examId) =>
  Exam.findOne({ schoolId, _id: examId })
    .populate('academicYearId', 'name code')
    .populate('academicTermId', 'name code')
    .populate('gradeIds', 'name code')
    .lean();

const createExam = (data) => Exam.create(data);

const updateExam = (schoolId, examId, updates) =>
  Exam.findOneAndUpdate({ schoolId, _id: examId }, { $set: updates }, { new: true, runValidators: true }).lean();

const deleteExam = (schoolId, examId) => Exam.findOneAndDelete({ schoolId, _id: examId });

const countExamsByAcademicYear = (schoolId, academicYearId) =>
  Exam.countDocuments({ schoolId, academicYearId });

// ---------------------------------------------------------------------------
// ClassSubject defaults
// ---------------------------------------------------------------------------

const findClassSubjectDefaults = (schoolId, academicYearId, gradeId, subjectIds) =>
  ClassSubject.find({ schoolId, academicYearId, gradeId, subjectId: { $in: subjectIds } })
    .select('subjectId maxMarks passMarks')
    .lean();

// ---------------------------------------------------------------------------
// ExamSubject
// ---------------------------------------------------------------------------

const listExamSubjects = (schoolId, examId, filters = {}) => {
  const query = { schoolId, examId };
  if (filters.gradeId) query.gradeId = filters.gradeId;
  return ExamSubject.find(query)
    .populate('subjectId', 'name code')
    .populate('gradeId', 'name code')
    .populate('invigilatorStaffId', 'name')
    .sort({ examDate: 1, startTime: 1 })
    .lean();
};

const findExamSubjectById = (schoolId, examSubjectId) =>
  ExamSubject.findOne({ schoolId, _id: examSubjectId })
    .populate('subjectId', 'name code')
    .populate('gradeId', 'name code')
    .populate('invigilatorStaffId', 'name')
    .lean();

// Editing marks after verification forces re-verification (see MarksEntryService.saveMarksBatch).
const clearExamSubjectVerification = (schoolId, examSubjectId) =>
  ExamSubject.findOneAndUpdate(
    { schoolId, _id: examSubjectId },
    { $unset: { marksVerifiedAt: '', marksVerifiedBy: '' } },
    { new: true }
  );

const markExamSubjectVerified = (schoolId, examSubjectId, userId) =>
  ExamSubject.findOneAndUpdate(
    { schoolId, _id: examSubjectId },
    { $set: { marksVerifiedAt: new Date(), marksVerifiedBy: userId } },
    { new: true }
  ).lean();

// Bulk upsert exam-subject rows keyed by {schoolId, examId, gradeId, subjectId}.
const upsertExamSubjects = async (schoolId, examId, rows) => {
  if (!rows || rows.length === 0) return { upsertedCount: 0, modifiedCount: 0 };

  const operations = rows.map((row) => ({
    updateOne: {
      filter: { schoolId, examId, gradeId: row.gradeId, subjectId: row.subjectId },
      update: { $set: { ...row, schoolId, examId } },
      upsert: true,
    },
  }));

  const result = await ExamSubject.bulkWrite(operations);
  return result;
};

// ---------------------------------------------------------------------------
// Enrollment resolver — always use Enrollment.isCurrent, never re-derive.
// ---------------------------------------------------------------------------

const getEnrolledStudentsForGrade = (schoolId, academicYearId, gradeId) =>
  Enrollment.find({ schoolId, academicYearId, gradeId, isCurrent: true })
    .populate('studentId', 'firstName lastName studentNumber admissionNumber')
    .lean();

// ---------------------------------------------------------------------------
// StudentMark
// ---------------------------------------------------------------------------

const listStudentMarksForExamSubject = (schoolId, examSubjectId) =>
  StudentMark.find({ schoolId, examSubjectId }).lean();

const findStudentMark = (schoolId, examSubjectId, studentId) =>
  StudentMark.findOne({ schoolId, examSubjectId, studentId }).lean();

// Builds the $set/$unset update document for one mark row. marksObtained is
// $unset (never defaulted to 0) whenever the row is absent/exempted or has no
// numeric value, matching the StudentMark schema's "undefined, not 0" rule.
const buildMarkUpdateDoc = (schoolId, examSubjectId, row, isInsertOnly) => {
  const set = {
    schoolId,
    examSubjectId,
    examId: row.examId,
    studentId: row.studentId,
    gradeId: row.gradeId,
    sectionId: row.sectionId,
    subjectId: row.subjectId,
    isAbsent: !!row.isAbsent,
    isExempted: !!row.isExempted,
    remarks: row.remarks || '',
    lastModifiedBy: row.userId,
    lastModifiedAt: new Date(),
  };

  const hasMarks = row.marksObtained !== undefined && row.marksObtained !== null && !row.isAbsent && !row.isExempted;
  const unset = {};
  if (hasMarks) {
    set.marksObtained = row.marksObtained;
  } else {
    unset.marksObtained = '';
  }

  // Phase 2: theory/practical split — same $unset-when-absent convention as
  // marksObtained above, so these are also never left as stray 0s.
  const hasTheoryMarks = row.theoryMarksObtained !== undefined && row.theoryMarksObtained !== null && !row.isAbsent && !row.isExempted;
  if (hasTheoryMarks) {
    set.theoryMarksObtained = row.theoryMarksObtained;
  } else {
    unset.theoryMarksObtained = '';
  }

  const hasPracticalMarks = row.practicalMarksObtained !== undefined && row.practicalMarksObtained !== null && !row.isAbsent && !row.isExempted;
  if (hasPracticalMarks) {
    set.practicalMarksObtained = row.practicalMarksObtained;
  } else {
    unset.practicalMarksObtained = '';
  }

  const setOnInsert = { enteredBy: row.userId, enteredAt: new Date() };

  const update = { $set: set };
  if (Object.keys(unset).length) update.$unset = unset;
  if (!isInsertOnly) update.$setOnInsert = setOnInsert;

  return update;
};

// Row-level optimistic-concurrency upsert for the marks-entry grid.
//
// This is the trickiest function in this file. A single Mongo `bulkWrite`
// cannot tell us, per-row, whether an individual `updateOne` matched zero
// documents (i.e. a version conflict) — `bulkWrite`'s result only reports
// aggregate counts. So instead of one bulkWrite for everything, we split the
// incoming rows into two groups:
//
//   1. Rows WITH an `expectedVersion` (the client had already fetched this
//      student's mark and is re-saving it) — these are written with
//      INDIVIDUAL `findOneAndUpdate` calls, filtering on
//      `{schoolId, examSubjectId, studentId, version: expectedVersion}` and
//      `upsert: false`. If a call returns `null`, no document matched that
//      exact version, so the row is a concurrency conflict (someone else
//      saved it first) — we collect `{studentId}` into `conflicts`.
//
//   2. Rows WITHOUT an `expectedVersion` (first-time entry, no prior mark
//      row exists yet) — these are safe to batch into a single `bulkWrite`
//      with `upsert: true`, since there is no prior version to race against.
//
// Every successful write increments `version` by 1 via `$inc`.
const bulkUpsertStudentMarks = async (schoolId, examSubjectId, rows) => {
  const savedStudentIds = [];
  const conflicts = [];

  const versionedRows = rows.filter((r) => r.expectedVersion !== undefined && r.expectedVersion !== null);
  const freshRows = rows.filter((r) => r.expectedVersion === undefined || r.expectedVersion === null);

  // 1. Versioned rows — individual findOneAndUpdate calls for per-row conflict detection.
  for (const row of versionedRows) {
    const update = buildMarkUpdateDoc(schoolId, examSubjectId, row, true);
    update.$inc = { version: 1 };

    // eslint-disable-next-line no-await-in-loop
    const result = await StudentMark.findOneAndUpdate(
      { schoolId, examSubjectId, studentId: row.studentId, version: row.expectedVersion },
      update,
      { new: true, upsert: false }
    );

    if (result) {
      savedStudentIds.push(String(row.studentId));
    } else {
      conflicts.push({ studentId: String(row.studentId) });
    }
  }

  // 2. Fresh rows — batched bulkWrite upsert (no prior version to race against).
  if (freshRows.length > 0) {
    const operations = freshRows.map((row) => {
      const update = buildMarkUpdateDoc(schoolId, examSubjectId, row, false);
      update.$inc = { version: 1 };
      return {
        updateOne: {
          filter: { schoolId, examSubjectId, studentId: row.studentId },
          update,
          upsert: true,
        },
      };
    });
    await StudentMark.bulkWrite(operations);
    freshRows.forEach((row) => savedStudentIds.push(String(row.studentId)));
  }

  return { savedStudentIds, conflicts };
};

// ---------------------------------------------------------------------------
// Correction workflow (Phase 2 / Tranche 2c) — bypass write
// ---------------------------------------------------------------------------

// DELIBERATELY bypasses saveMarksBatch's validation AND the LOCKED-exam guard
// — that IS the whole point of the correction-request/approval workflow: it
// is the one sanctioned way to edit a StudentMark row after its exam has been
// locked. This must ONLY ever be called from
// resultCorrectionService.approveCorrection, never from the normal
// marks-entry path (getMarksGrid/saveMarksBatch/verifyExamSubjectMarks).
//
// `upsert: true` (a deliberate addition beyond a bare findOneAndUpdate) so a
// correction that targets a student who was missed entirely during the
// original marks entry (no prior StudentMark row — a legitimate case per
// resultCorrectionService.requestCorrection's previousValue handling) still
// creates the row instead of silently matching nothing. newValues must
// include every field StudentMark requires (schoolId/examId/examSubjectId/
// studentId) since only schoolId/examSubjectId/studentId are covered by the
// filter's implicit on-insert population.
const applyCorrectionToStudentMark = (schoolId, examSubjectId, studentId, newValues) =>
  StudentMark.findOneAndUpdate(
    { schoolId, examSubjectId, studentId },
    { $set: { ...newValues, lastModifiedAt: new Date() }, $inc: { version: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

module.exports = {
  listExams,
  findExamById,
  createExam,
  updateExam,
  deleteExam,
  countExamsByAcademicYear,
  findClassSubjectDefaults,
  listExamSubjects,
  findExamSubjectById,
  clearExamSubjectVerification,
  markExamSubjectVerified,
  upsertExamSubjects,
  getEnrolledStudentsForGrade,
  listStudentMarksForExamSubject,
  findStudentMark,
  bulkUpsertStudentMarks,
  applyCorrectionToStudentMark,
};
