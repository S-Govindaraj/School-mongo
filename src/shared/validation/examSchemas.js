const { z } = require('zod');

const dateRefinement = [(data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate);
  }
  return true;
}, {
  message: 'End date must be on or after the start date.',
  path: ['endDate'],
}];

const baseExamSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  academicTermId: z.string().optional(),
  title: z.string().trim().min(1, 'Exam title is required').max(200, 'Exam title cannot exceed 200 characters'),
  examType: z.enum(['UNIT_TEST', 'MID_TERM', 'FINAL', 'PROJECT', 'PRACTICAL']).optional(),
  description: z.string().optional(),
  gradeIds: z.array(z.string()).min(1, 'At least one grade is required'),
  startDate: z.string(),
  endDate: z.string(),
  // Phase 2 (Tranche 2a): this exam's weight in term-weighted report-card
  // aggregation. Optional — an unset weight is an equal-weight fallback, not zero.
  weightPercent: z.number().min(0).max(100).optional(),
});

const examSchema = baseExamSchema.refine(...dateRefinement);
const updateExamSchema = baseExamSchema.partial().refine(...dateRefinement);

const examSubjectRowSchema = z.object({
  subjectId: z.string().min(1, 'Subject ID is required'),
  maxMarks: z.number().positive('Max marks must be greater than 0').optional(),
  passMarks: z.number().min(0, 'Pass marks cannot be negative').optional(),
  hasTheoryPractical: z.boolean().optional(),
  theoryMaxMarks: z.number().positive().optional(),
  theoryPassMarks: z.number().min(0).optional(),
  practicalMaxMarks: z.number().positive().optional(),
  practicalPassMarks: z.number().min(0).optional(),
  examDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  durationMinutes: z.number().positive().optional(),
  room: z.string().optional(),
  invigilatorStaffId: z.string().optional(),
});

const examSubjectBulkSchema = z.object({
  gradeId: z.string().min(1, 'Grade ID is required'),
  subjects: z.array(examSubjectRowSchema).min(1, 'At least one subject is required'),
});

const marksEntryRowSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  marksObtained: z.number().min(0).optional(),
  theoryMarksObtained: z.number().min(0).optional(),
  practicalMarksObtained: z.number().min(0).optional(),
  isAbsent: z.boolean().optional(),
  isExempted: z.boolean().optional(),
  remarks: z.string().optional(),
  version: z.number().optional(),
});

const marksEntryBatchSchema = z.object({
  rows: z.array(marksEntryRowSchema).min(1, 'At least one row is required'),
});

const examPublishSchema = z.object({});

const examUnlockSchema = z.object({
  reason: z.string().min(3, 'A reason of at least 3 characters is required'),
});

module.exports = {
  examSchema,
  updateExamSchema,
  examSubjectBulkSchema,
  marksEntryBatchSchema,
  examPublishSchema,
  examUnlockSchema,
};
