const { z } = require('zod');

const requestedValueSchema = z.object({
  marksObtained: z.number().optional(),
  theoryMarksObtained: z.number().optional(),
  practicalMarksObtained: z.number().optional(),
  isAbsent: z.boolean().optional(),
  isExempted: z.boolean().optional(),
  remarks: z.string().optional(),
});

const resultCorrectionRequestSchema = z.object({
  examSubjectId: z.string().min(1, 'Exam subject ID is required'),
  studentId: z.string().min(1, 'Student ID is required'),
  reason: z.string().min(3, 'A reason of at least 3 characters is required'),
  requestedValue: requestedValueSchema,
});

const resultCorrectionRejectSchema = z.object({
  reviewNotes: z.string().optional(),
});

module.exports = {
  resultCorrectionRequestSchema,
  resultCorrectionRejectSchema,
};
