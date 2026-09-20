const { z } = require('zod');

const schoolProfileSchema = z.object({
  name: z.string().min(1, 'School name is required').optional(),
  code: z.string().min(1, 'School code is required').optional(),
  registrationNumber: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  logo: z.string().nullable().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  dateFormat: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const campusSchema = z.object({
  name: z.string().min(1, 'Campus name is required'),
  code: z.string().min(1, 'Campus code is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  isMain: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const updateCampusSchema = campusSchema.partial();

const normalizeAcademicYearString = (val) => {
  if (!val || typeof val !== 'string') return val;
  const trimmed = val.trim();
  const match = trimmed.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return trimmed;
};

const validateAcademicYearYears = (val) => {
  if (!val || typeof val !== 'string') return false;
  const match = val.trim().match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (!match) return false;
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  return end === start + 1;
};

const baseAcademicYearSchema = z.object({
  name: z
    .string()
    .min(1, 'Academic year name is required')
    .transform(normalizeAcademicYearString)
    .refine((v) => /^\d{4}-\d{4}$/.test(v), {
      message: 'Enter a valid academic year such as 2026 - 2027.',
    })
    .refine(validateAcademicYearYears, {
      message: 'The ending year must be exactly one year after the starting year.',
    }),
  code: z
    .string()
    .min(1, 'Academic year code is required')
    .transform(normalizeAcademicYearString)
    .refine((v) => /^\d{4}-\d{4}$/.test(v), {
      message: 'Enter a valid academic year such as 2026 - 2027.',
    })
    .refine(validateAcademicYearYears, {
      message: 'The ending year must be exactly one year after the starting year.',
    }),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  isCurrent: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('INACTIVE'),
});

const dateRefinement = [(data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) < new Date(data.endDate);
  }
  return true;
}, {
  message: 'End date must be after the start date.',
  path: ['endDate'],
}];

const academicYearSchema = baseAcademicYearSchema.refine(...dateRefinement);
const updateAcademicYearSchema = z.object({
  name: z
    .string()
    .min(1, 'Academic year name is required')
    .transform(normalizeAcademicYearString)
    .refine((v) => /^\d{4}-\d{4}$/.test(v), {
      message: 'Enter a valid academic year such as 2026 - 2027.',
    })
    .refine(validateAcademicYearYears, {
      message: 'The ending year must be exactly one year after the starting year.',
    })
    .optional(),
  code: z
    .string()
    .min(1, 'Academic year code is required')
    .transform(normalizeAcademicYearString)
    .refine((v) => /^\d{4}-\d{4}$/.test(v), {
      message: 'Enter a valid academic year such as 2026 - 2027.',
    })
    .refine(validateAcademicYearYears, {
      message: 'The ending year must be exactly one year after the starting year.',
    })
    .optional(),
  startDate: z.string().or(z.date()).optional(),
  endDate: z.string().or(z.date()).optional(),
  isCurrent: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
}).refine(...dateRefinement);

const baseAcademicTermSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  name: z.string().trim().min(1, 'Term name is required').max(100, 'Term name cannot exceed 100 characters'),
  code: z.string().trim().toUpperCase().min(1, 'Term code is required').max(50, 'Term code cannot exceed 50 characters'),
  sequence: z.number().int('Sequence must be an integer').min(1, 'Sequence must be a positive integer').default(1),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  isCurrent: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('INACTIVE'),
});

const academicTermSchema = baseAcademicTermSchema.refine(...dateRefinement);
const updateAcademicTermSchema = baseAcademicTermSchema.partial().refine(...dateRefinement);

const gradeSchema = z.object({
  name: z.string().trim().min(1, 'Grade name is required').max(100, 'Grade name cannot exceed 100 characters'),
  code: z.string().trim().toUpperCase().min(1, 'Grade code is required').max(50, 'Grade code cannot exceed 50 characters'),
  displayName: z.string().trim().optional(),
  category: z.string().trim().default('Primary'),
  sequenceOrder: z.number().int('Display order must be an integer').min(1, 'Display order must be a positive integer').default(1),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('INACTIVE'),
});

const updateGradeSchema = gradeSchema.partial();

const sectionSchema = z.object({
  gradeId: z.string().min(1, 'Grade ID is required'),
  name: z.string().trim().min(1, 'Section name is required').max(50, 'Section name cannot exceed 50 characters'),
  code: z.string().trim().toUpperCase().min(1, 'Section code is required').max(50, 'Section code cannot exceed 50 characters'),
  capacity: z.number().int('Capacity must be an integer').min(1, 'Capacity must be greater than 0').default(40),
  room: z.string().trim().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('INACTIVE'),
});

const updateSectionSchema = sectionSchema.partial();

const subjectSchema = z.object({
  name: z.string().trim().min(1, 'Subject name is required').max(150, 'Subject name cannot exceed 150 characters'),
  code: z.string().trim().toUpperCase().min(1, 'Subject code is required').max(50, 'Subject code cannot exceed 50 characters'),
  shortName: z.string().trim().default(''),
  type: z.enum(['CORE', 'ELECTIVE', 'LANGUAGE', 'PRACTICAL', 'OTHER']).default('CORE'),
  description: z.string().trim().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('INACTIVE'),
});

const updateSubjectSchema = subjectSchema.partial();

const classSubjectBaseSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  gradeId: z.string().min(1, 'Grade ID is required'),
  subjectId: z.string().min(1, 'Subject ID is required'),
  isMandatory: z.boolean().default(true),
  isElective: z.boolean().default(false),
  subjectGroup: z.string().trim().optional(),
  sequence: z.number().int().min(1).optional(),
  weeklyPeriods: z.number().int('Weekly periods must be an integer').min(1, 'Weekly periods must be at least 1').max(50, 'Weekly periods cannot exceed 50').default(5),
  passMarks: z.number().min(0, 'Pass marks cannot be negative').default(35),
  maxMarks: z.number().min(1, 'Max marks must be greater than 0').default(100),
  theoryMarks: z.number().min(0).optional(),
  practicalMarks: z.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('INACTIVE'),
});

const classSubjectRefinement = [
  (data) => {
    if (data.passMarks !== undefined && data.maxMarks !== undefined) {
      if (data.passMarks > data.maxMarks) return false;
    }
    if (data.theoryMarks !== undefined && data.practicalMarks !== undefined && data.maxMarks !== undefined) {
      if (data.theoryMarks + data.practicalMarks !== data.maxMarks) return false;
    }
    if (data.isElective && (!data.subjectGroup || !data.subjectGroup.trim())) {
      return false;
    }
    return true;
  },
  {
    message: 'Invalid marks or elective configuration: pass marks cannot exceed max marks, theory + practical must equal max marks when both configured, and elective subjects require an elective group.',
  },
];

const classSubjectSchema = classSubjectBaseSchema.refine(...classSubjectRefinement);
const updateClassSubjectSchema = classSubjectBaseSchema.partial().refine(...classSubjectRefinement);

const bulkClassSubjectSchema = z.object({
  items: z.array(classSubjectSchema).min(1, 'At least one class subject item is required.'),
});

const staffSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  designation: z.string().min(1, 'Designation is required'),
  department: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  joiningDate: z.string().or(z.date()).optional(),
  qualification: z.string().optional(),
  experienceYears: z.number().optional(),
  employmentStatus: z.enum(['TEACHING', 'NON_TEACHING', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  userId: z.string().optional(),
});

const updateStaffSchema = staffSchema.partial();

const baseTeacherAssignmentObject = z.object({
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  gradeId: z.string().min(1, 'Grade ID is required'),
  sectionId: z.string().min(1, 'Section ID is required'),
  subjectId: z.string().min(1, 'Subject ID is required'),
  staffId: z.string().min(1, 'Staff member ID is required').optional(),
  teacherId: z.string().min(1, 'Staff member ID is required').optional(),
  isClassTeacher: z.boolean().default(false),
  assignmentType: z.enum(['PRIMARY', 'ASSISTANT', 'CO_TEACHER']).default('PRIMARY'),
  startDate: z.string().or(z.date()).optional(),
  endDate: z.string().or(z.date()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('INACTIVE'),
});

const teacherAssignmentSchema = baseTeacherAssignmentObject.superRefine((data, ctx) => {
  if (!data.staffId && !data.teacherId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Staff member ID is required', path: ['staffId'] });
  }
  if (data.startDate && data.endDate && new Date(data.startDate) >= new Date(data.endDate)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start date must be before end date', path: ['endDate'] });
  }
});

const updateTeacherAssignmentSchema = baseTeacherAssignmentObject.partial();

const basePeriodObject = z.object({
  name: z.string().trim().min(1, 'Period name is required').max(50, 'Period name cannot exceed 50 characters'),
  code: z.string().trim().toUpperCase().min(1, 'Period code is required').max(20, 'Period code cannot exceed 20 characters'),
  sequence: z.number().int('Sequence must be an integer').min(1, 'Sequence must be a positive integer'),
  startTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be in HH:mm format (e.g. 09:00)'),
  endTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be in HH:mm format (e.g. 09:45)'),
  durationMinutes: z.number().optional(),
  isBreak: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('INACTIVE'),
});

const periodSchema = basePeriodObject.refine((data) => data.startTime < data.endTime, {
  message: 'Start time must be before end time.',
  path: ['endTime'],
});

const updatePeriodSchema = basePeriodObject.partial();

const timetableSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  gradeId: z.string().min(1, 'Grade ID is required'),
  sectionId: z.string().min(1, 'Section ID is required'),
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  periodId: z.string().min(1, 'Period ID is required'),
  subjectId: z.string().min(1, 'Subject ID is required'),
  teacherId: z.string().min(1, 'Teacher ID is required'),
  roomNumber: z.string().trim().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('INACTIVE'),
});

const updateTimetableSchema = timetableSchema.partial();

const baseLeaveRequestObject = z.object({
  studentId: z.string().optional(),
  applicantId: z.string().optional(),
  applicantType: z.enum(['STUDENT', 'STAFF']).default('STUDENT'),
  leaveType: z.string().min(1, 'Leave type is required'),
  academicYearId: z.string().optional(),
  fromDate: z.string().or(z.date()).optional(),
  toDate: z.string().or(z.date()).optional(),
  startDate: z.string().or(z.date()).optional(),
  endDate: z.string().or(z.date()).optional(),
  reason: z.string().trim().min(1, 'Reason is required'),
  supportingDocument: z.string().optional(),
  requestedBy: z.string().trim().default('PARENT'),
  status: z.enum(['DRAFT', 'SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'ARCHIVED']).default('PENDING'),
});

const leaveRequestSchema = baseLeaveRequestObject.superRefine((data, ctx) => {
  const start = data.startDate || data.fromDate;
  const end = data.endDate || data.toDate;
  if (!start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start date is required', path: ['startDate'] });
  }
  if (!end) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date is required', path: ['endDate'] });
  }
  if (start && end && new Date(start) > new Date(end)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start date must be on or before End date', path: ['endDate'] });
  }
});

const updateLeaveRequestSchema = baseLeaveRequestObject.partial();

const updateSettingsSchema = z.object({
  settings: z.array(
    z.object({
      category: z.string().min(1, 'Category is required'),
      key: z.string().min(1, 'Key is required'),
      value: z.any(),
      description: z.string().optional(),
    })
  ),
});

const roleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  code: z.string().min(1, 'Role code is required'),
  description: z.string().optional(),
  hierarchyLevel: z.number().optional(),
  permissions: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const updateRoleSchema = roleSchema.partial();

const studentSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional().or(z.literal('')),
  lastName: z.string().min(1, 'Last name is required'),
  dob: z.string().or(z.date()),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']).optional(),
  nationality: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  previousSchool: z.string().optional(),
  emergencyContact: z.object({
    name: z.string().optional(),
    relationship: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),
  guardians: z.array(z.object({
    name: z.string().min(1, 'Guardian name is required'),
    relationship: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']),
    phone: z.string().min(1, 'Guardian phone is required'),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    occupation: z.string().optional(),
    address: z.string().optional(),
    isPrimary: z.boolean().optional(),
    isEmergencyContact: z.boolean().optional(),
  })).optional(),
});

const updateStudentSchema = studentSchema.partial();

const studentStatusSchema = z.object({
  status: z.enum(['APPLICANT', 'ADMITTED', 'ACTIVE', 'PROMOTED', 'GRADUATED', 'ALUMNI', 'WITHDRAWN', 'TRANSFERRED', 'SUSPENDED', 'INACTIVE', 'ARCHIVED']),
  reason: z.string().optional(),
});

const guardianSchema = z.object({
  name: z.string().min(1, 'Guardian name is required'),
  relationship: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  occupation: z.string().optional(),
  address: z.string().optional(),
  isPrimary: z.boolean().optional(),
  isEmergencyContact: z.boolean().optional(),
});

const updateGuardianSchema = guardianSchema.partial();

const admissionSchema = z.object({
  academicYearId: z.string().min(1, 'Academic Year is required'),
  gradeId: z.string().min(1, 'Grade is required'),
  studentData: z.object({
    firstName: z.string().min(1, 'First name is required'),
    middleName: z.string().optional().or(z.literal('')),
    lastName: z.string().min(1, 'Last name is required'),
    dob: z.string().or(z.date()),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
    bloodGroup: z.string().optional(),
    nationality: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    address: z.object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    }).optional(),
    previousSchool: z.string().optional(),
  }),
  guardianData: z.array(z.object({
    name: z.string().min(1, 'Guardian name is required'),
    relationship: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']),
    phone: z.string().min(1, 'Guardian phone is required'),
    email: z.string().email().optional().or(z.literal('')),
    occupation: z.string().optional(),
    isPrimary: z.boolean().optional(),
    isEmergencyContact: z.boolean().optional(),
  })).min(1, 'At least one guardian is required'),
  notes: z.string().optional(),
});

const updateAdmissionStatusSchema = z.object({
  status: z.enum(['APPLICATION', 'UNDER_REVIEW', 'APPROVED', 'ADMITTED', 'ENROLLED', 'REJECTED', 'ARCHIVED']),
  rejectionReason: z.string().optional(),
  notes: z.string().optional(),
});

const enrollmentSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  academicYearId: z.string().min(1, 'Academic Year is required'),
  gradeId: z.string().min(1, 'Grade is required'),
  sectionId: z.string().min(1, 'Section is required'),
});

module.exports = {
  schoolProfileSchema,
  campusSchema,
  updateCampusSchema,
  academicYearSchema,
  updateAcademicYearSchema,
  academicTermSchema,
  updateAcademicTermSchema,
  gradeSchema,
  updateGradeSchema,
  sectionSchema,
  updateSectionSchema,
  subjectSchema,
  updateSubjectSchema,
  classSubjectSchema,
  updateClassSubjectSchema,
  bulkClassSubjectSchema,
  staffSchema,
  updateStaffSchema,
  teacherAssignmentSchema,
  updateTeacherAssignmentSchema,
  updateSettingsSchema,
  roleSchema,
  updateRoleSchema,
  studentSchema,
  updateStudentSchema,
  studentStatusSchema,
  guardianSchema,
  updateGuardianSchema,
  admissionSchema,
  updateAdmissionStatusSchema,
  enrollmentSchema,
  periodSchema,
  updatePeriodSchema,
  timetableSchema,
  updateTimetableSchema,
  leaveRequestSchema,
  normalizeAcademicYearString,
  validateAcademicYearYears,
};
