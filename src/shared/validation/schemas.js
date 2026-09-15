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

const baseAcademicYearSchema = z.object({
  name: z.string().min(1, 'Academic year name is required'),
  code: z.string().min(1, 'Academic year code is required'),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  isCurrent: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const dateRefinement = [(data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) < new Date(data.endDate);
  }
  return true;
}, {
  message: 'Start date must be before end date',
  path: ['startDate'],
}];

const academicYearSchema = baseAcademicYearSchema.refine(...dateRefinement);
const updateAcademicYearSchema = baseAcademicYearSchema.partial().refine(...dateRefinement);

const baseAcademicTermSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  name: z.string().min(1, 'Term name is required'),
  code: z.string().min(1, 'Term code is required'),
  sequence: z.number().min(1).optional(),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  isCurrent: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const academicTermSchema = baseAcademicTermSchema.refine(...dateRefinement);
const updateAcademicTermSchema = baseAcademicTermSchema.partial().refine(...dateRefinement);

const gradeSchema = z.object({
  name: z.string().min(1, 'Grade name is required'),
  code: z.string().min(1, 'Grade code is required'),
  displayName: z.string().optional(),
  category: z.string().optional(),
  sequenceOrder: z.number().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const updateGradeSchema = gradeSchema.partial();

const sectionSchema = z.object({
  gradeId: z.string().min(1, 'Grade ID is required'),
  name: z.string().min(1, 'Section name is required'),
  code: z.string().min(1, 'Section code is required'),
  capacity: z.number().min(0, 'Capacity must be greater than or equal to 0').optional(),
  room: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const updateSectionSchema = sectionSchema.partial();

const subjectSchema = z.object({
  name: z.string().min(1, 'Subject name is required'),
  code: z.string().min(1, 'Subject code is required'),
  shortName: z.string().optional(),
  type: z.enum(['THEORY', 'PRACTICAL', 'LANGUAGE', 'ACTIVITY', 'ELECTIVE', 'CORE']).optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const updateSubjectSchema = subjectSchema.partial();

const classSubjectSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  gradeId: z.string().min(1, 'Grade ID is required'),
  subjectId: z.string().min(1, 'Subject ID is required'),
  isMandatory: z.boolean().optional(),
  isElective: z.boolean().optional(),
  subjectGroup: z.string().optional(),
  sequence: z.number().optional(),
  weeklyPeriods: z.number().optional(),
  passMarks: z.number().optional(),
  maxMarks: z.number().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const updateClassSubjectSchema = classSubjectSchema.partial();

const bulkClassSubjectSchema = z.object({
  items: z.array(classSubjectSchema),
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

const teacherAssignmentSchema = z.object({
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  gradeId: z.string().min(1, 'Grade ID is required'),
  sectionId: z.string().min(1, 'Section ID is required'),
  subjectId: z.string().min(1, 'Subject ID is required'),
  staffId: z.string().min(1, 'Staff member ID is required'),
  isClassTeacher: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

const updateTeacherAssignmentSchema = teacherAssignmentSchema.partial();

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
};
