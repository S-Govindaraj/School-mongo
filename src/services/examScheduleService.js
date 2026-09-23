const examRepository = require('../repositories/examRepository');
const { NotFoundError, ValidationError } = require('../utils/errors');

const requireExam = async (schoolId, examId) => {
  const exam = await examRepository.findExamById(schoolId, examId);
  if (!exam) {
    throw new NotFoundError('Exam not found');
  }
  return exam;
};

const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const sameDate = (a, b) => {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
};

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && bStart < aEnd;
};

const formatDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : 'unknown date');

class ExamScheduleService {
  // Fetches all ExamSubject rows for the exam once, then runs two in-memory
  // pairwise checks: same invigilator with overlapping time on the same date,
  // and same grade with overlapping time on the same date.
  static async detectConflicts(schoolId, examId) {
    await requireExam(schoolId, examId);
    const examSubjects = await examRepository.listExamSubjects(schoolId, examId, {});

    const conflicts = [];

    const checkGroup = (groupBy, type, labelFn) => {
      const groups = {};
      examSubjects.forEach((es) => {
        const key = es[groupBy] ? String(es[groupBy]?._id || es[groupBy]) : null;
        if (!key) return;
        if (!groups[key]) groups[key] = [];
        groups[key].push(es);
      });

      Object.values(groups).forEach((group) => {
        if (group.length < 2) return;
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i];
            const b = group[j];
            if (!sameDate(a.examDate, b.examDate)) continue;
            const aStart = toMinutes(a.startTime);
            const aEnd = toMinutes(a.endTime);
            const bStart = toMinutes(b.startTime);
            const bEnd = toMinutes(b.endTime);
            if (overlaps(aStart, aEnd, bStart, bEnd)) {
              conflicts.push({
                type,
                examSubjectIds: [String(a._id), String(b._id)],
                message: labelFn(a, b),
              });
            }
          }
        }
      });
    };

    checkGroup(
      'invigilatorStaffId',
      'INVIGILATOR_CONFLICT',
      (a, b) => `The invigilator is double-booked: two subjects are both scheduled ${a.startTime}-${a.endTime} on ${formatDate(a.examDate)}.`
    );
    checkGroup(
      'gradeId',
      'GRADE_CONFLICT',
      (a, b) => `Two subjects for the same grade are both scheduled ${a.startTime}-${a.endTime} on ${formatDate(a.examDate)}.`
    );

    return { conflicts };
  }

  static async confirmSchedule(schoolId, examId) {
    const exam = await requireExam(schoolId, examId);
    if (exam.status !== 'DRAFT') {
      throw new ValidationError('Only a DRAFT exam can be confirmed for scheduling.');
    }

    const examSubjects = await examRepository.listExamSubjects(schoolId, examId, {});
    const missing = examSubjects.filter(
      (es) => !es.examDate || !es.startTime || !es.endTime || !es.room
    );
    if (missing.length > 0) {
      throw new ValidationError(
        'All exam subjects must have a date, time and room before scheduling can be confirmed.',
        missing.map((es) => ({ examSubjectId: String(es._id), reason: 'Missing examDate/startTime/endTime/room' }))
      );
    }

    const { conflicts } = await ExamScheduleService.detectConflicts(schoolId, examId);
    if (conflicts.length > 0) {
      throw new ValidationError('Schedule has conflicts that must be resolved first.', conflicts);
    }

    return examRepository.updateExam(schoolId, examId, { status: 'SCHEDULED' });
  }

  static async startExam(schoolId, examId) {
    const exam = await requireExam(schoolId, examId);
    if (exam.status !== 'SCHEDULED') {
      throw new ValidationError('Only a SCHEDULED exam can be started.');
    }
    return examRepository.updateExam(schoolId, examId, { status: 'ONGOING' });
  }

  static async completeExam(schoolId, examId) {
    const exam = await requireExam(schoolId, examId);
    if (exam.status !== 'ONGOING') {
      throw new ValidationError('Only an ONGOING exam can be completed.');
    }
    return examRepository.updateExam(schoolId, examId, { status: 'COMPLETED' });
  }
}

module.exports = ExamScheduleService;
