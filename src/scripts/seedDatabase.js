require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore DNS override errors
}

const Permission = require('../models/Permission');
const Role = require('../models/Role');
const School = require('../models/School');
const Campus = require('../models/Campus');
const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const Subject = require('../models/Subject');
const ClassSubject = require('../models/ClassSubject');
const Staff = require('../models/Staff');
const User = require('../models/User');
const TeacherAssignment = require('../models/TeacherAssignment');
const Setting = require('../models/Setting');
const AuditLog = require('../models/AuditLog');
const Student = require('../models/Student');
const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const Admission = require('../models/Admission');
const Enrollment = require('../models/Enrollment');
const StudentDocument = require('../models/StudentDocument');
const AcademicHistory = require('../models/AcademicHistory');
const Period = require('../models/Period');
const Timetable = require('../models/Timetable');
const AttendanceStatus = require('../models/AttendanceStatus');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceAudit = require('../models/AttendanceAudit');
const LeaveRequest = require('../models/LeaveRequest');
const FeeCategory = require('../models/FeeCategory');
const FeeStructure = require('../models/FeeStructure');
const FeeStructureItem = require('../models/FeeStructureItem');
const StudentFeeAssignment = require('../models/StudentFeeAssignment');
const FeeConcession = require('../models/FeeConcession');
const FeeFineRule = require('../models/FeeFineRule');
const Invoice = require('../models/Invoice');
const InvoiceItem = require('../models/InvoiceItem');
const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const Receipt = require('../models/Receipt');
const Refund = require('../models/Refund');
const FinancialAdjustment = require('../models/FinancialAdjustment');
const StudentLedger = require('../models/StudentLedger');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const NotificationTemplate = require('../models/NotificationTemplate');
const Message = require('../models/Message');

// 1. Comprehensive Master Permissions
const permissionsData = [
  // Student & Admission Management
  { id: 'student_view', module: 'Student Management', action: 'view', code: 'student_view', name: 'View Students', description: 'View student master directory and 360 profiles' },
  { id: 'student_create', module: 'Student Management', action: 'create', code: 'student_create', name: 'Create Students', description: 'Create and register student profiles' },
  { id: 'student_update', module: 'Student Management', action: 'update', code: 'student_update', name: 'Update Students', description: 'Update student profiles and status' },
  { id: 'student_archive', module: 'Student Management', action: 'archive', code: 'student_archive', name: 'Archive Students', description: 'Archive student records' },
  { id: 'guardian_view', module: 'Student Management', action: 'view', code: 'guardian_view', name: 'View Guardians', description: 'View parent and guardian directory' },
  { id: 'guardian_create', module: 'Student Management', action: 'create', code: 'guardian_create', name: 'Create Guardians', description: 'Create parent and guardian profiles' },
  { id: 'guardian_update', module: 'Student Management', action: 'update', code: 'guardian_update', name: 'Update Guardians', description: 'Update guardian details' },
  { id: 'exam_result_view', module: 'Student Management', action: 'view', code: 'exam_result_view', name: 'View Exam Results', description: 'View student exam results in the Student 360 profile' },
  { id: 'discipline_view', module: 'Student Management', action: 'view', code: 'discipline_view', name: 'View Discipline Records', description: 'View student discipline incidents and disciplinary actions (sensitive — must be granted explicitly per role)' },
  { id: 'medical_view', module: 'Student Management', action: 'view', code: 'medical_view', name: 'View Medical Records', description: 'View student health profile and medical visit history (sensitive — must be granted explicitly per role)' },

  // Examinations
  { id: 'exam_view', module: 'Examinations', action: 'view', code: 'exam_view', name: 'View Exams', description: 'View exam definitions, schedules and exam subject configuration' },
  { id: 'exam_manage', module: 'Examinations', action: 'manage', code: 'exam_manage', name: 'Manage Exams', description: 'Create, edit, schedule and delete exams and their subjects' },
  { id: 'exam_marks_enter', module: 'Examinations', action: 'update', code: 'exam_marks_enter', name: 'Enter Marks', description: 'Enter and edit student marks in the marks-entry grid' },
  { id: 'exam_marks_verify', module: 'Examinations', action: 'approve', code: 'exam_marks_verify', name: 'Verify Marks', description: 'Verify a subject\'s marks as complete and correct (sensitive — must be granted explicitly per role)' },
  { id: 'exam_result_calculate', module: 'Examinations', action: 'update', code: 'exam_result_calculate', name: 'Calculate Results', description: 'Run the result-readiness calculation for an exam' },
  { id: 'exam_result_publish', module: 'Examinations', action: 'approve', code: 'exam_result_publish', name: 'Publish Results', description: 'Publish exam results to students and parents (sensitive — must be granted explicitly per role)' },
  { id: 'exam_lock', module: 'Examinations', action: 'manage', code: 'exam_lock', name: 'Lock / Unlock Exam', description: 'Lock or unlock a published exam to freeze or reopen its results (sensitive — must be granted explicitly per role)' },
  { id: 'exam_correction_view', module: 'Examinations', action: 'view', code: 'exam_correction_view', name: 'View Result Corrections', description: 'View result correction requests and their status' },
  { id: 'exam_correction_request', module: 'Examinations', action: 'update', code: 'exam_correction_request', name: 'Request Result Correction', description: 'Request a correction to a student\'s marks on a locked exam' },
  { id: 'exam_correction_approve', module: 'Examinations', action: 'approve', code: 'exam_correction_approve', name: 'Approve Result Correction', description: 'Approve or reject a result correction request, applying it to the published result (sensitive — must be granted explicitly per role)' },
  { id: 'admission_view', module: 'Admissions & Enrollment', action: 'view', code: 'admission_view', name: 'View Admissions', description: 'View admission applications' },
  { id: 'admission_create', module: 'Admissions & Enrollment', action: 'create', code: 'admission_create', name: 'Submit Admissions', description: 'Create admission applications' },
  { id: 'admission_update', module: 'Admissions & Enrollment', action: 'update', code: 'admission_update', name: 'Update Admissions', description: 'Update application status and review notes' },
  { id: 'admission_approve', module: 'Admissions & Enrollment', action: 'approve', code: 'admission_approve', name: 'Approve & Admit', description: 'Approve admissions and convert to student records' },
  { id: 'enrollment_view', module: 'Admissions & Enrollment', action: 'view', code: 'enrollment_view', name: 'View Enrollments', description: 'View student academic year enrollments' },
  { id: 'enrollment_create', module: 'Admissions & Enrollment', action: 'create', code: 'enrollment_create', name: 'Create Enrollments', description: 'Enroll students into grade and section' },
  { id: 'enrollment_update', module: 'Admissions & Enrollment', action: 'update', code: 'enrollment_update', name: 'Promote / Transfer Students', description: 'Promote or re-enroll students' },

  // People & Staff Management
  { id: 'staff_view', module: 'People & Staff', action: 'view', code: 'staff_view', name: 'View Teachers & Staff', description: 'View staff directory and member profiles' },
  { id: 'staff_manage', module: 'People & Staff', action: 'manage', code: 'staff_manage', name: 'Manage Teachers & Staff', description: 'Register, edit and manage staff members' },
  { id: 'teacher_assignment_view', module: 'People & Staff', action: 'view', code: 'teacher_assignment_view', name: 'View Teacher Assignments', description: 'View teacher class and subject assignments' },
  { id: 'teacher_assignment_create', module: 'People & Staff', action: 'create', code: 'teacher_assignment_create', name: 'Create Teacher Assignment', description: 'Assign teachers to classes, sections and subjects' },
  { id: 'teacher_assignment_edit', module: 'People & Staff', action: 'edit', code: 'teacher_assignment_edit', name: 'Edit Teacher Assignment', description: 'Modify teacher assignments' },
  { id: 'teacher_assignment_active', module: 'People & Staff', action: 'active', code: 'teacher_assignment_active', name: 'Activate Teacher Assignment', description: 'Activate teacher assignments' },
  { id: 'teacher_assignment_inactive', module: 'People & Staff', action: 'inactive', code: 'teacher_assignment_inactive', name: 'Deactivate Teacher Assignment', description: 'Deactivate teacher assignments' },
  { id: 'teacher_assignment_manage', module: 'People & Staff', action: 'manage', code: 'teacher_assignment_manage', name: 'Manage Teacher Assignments', description: 'Assign teachers to classes, sections and subjects' },

  // Roles & Access Control
  { id: 'role_view', module: 'Roles & Access Control', action: 'view', code: 'role_view', name: 'View Roles & Permissions', description: 'View role directory and permission matrix' },
  { id: 'role_manage', module: 'Roles & Access Control', action: 'manage', code: 'role_manage', name: 'Manage Roles & Permissions', description: 'Create, modify and manage system roles and permissions' },

  // School & Campus Setup
  { id: 'school_view', module: 'School Setup', action: 'view', code: 'school_view', name: 'View School Profile', description: 'View school institution profile' },
  { id: 'school_manage', module: 'School Setup', action: 'manage', code: 'school_manage', name: 'Manage School Profile', description: 'Update school profile and configuration' },
  { id: 'campus_view', module: 'School Setup', action: 'view', code: 'campus_view', name: 'View Campuses', description: 'View school campus list' },
  { id: 'campus_manage', module: 'School Setup', action: 'manage', code: 'campus_manage', name: 'Manage Campuses', description: 'Create, edit, delete school campuses' },

  // Academic Setup
  { id: 'academic_config_view', module: 'Academic Setup', action: 'view', code: 'academic_config_view', name: 'View Academic Configuration', description: 'Access the full Academic Configuration workspace' },
  { id: 'academic_year_view', module: 'Academic Setup', action: 'view', code: 'academic_year_view', name: 'View Academic Years', description: 'View academic calendar years' },
  { id: 'academic_year_create', module: 'Academic Setup', action: 'create', code: 'academic_year_create', name: 'Create Academic Year', description: 'Add new academic calendar years' },
  { id: 'academic_year_edit', module: 'Academic Setup', action: 'edit', code: 'academic_year_edit', name: 'Edit Academic Year', description: 'Modify academic calendar years' },
  { id: 'academic_year_inactive', module: 'Academic Setup', action: 'inactive', code: 'academic_year_inactive', name: 'Deactivate Academic Year', description: 'Deactivate academic calendar years' },
  { id: 'academic_year_active', module: 'Academic Setup', action: 'active', code: 'academic_year_active', name: 'Activate Academic Year', description: 'Activate or set as current academic calendar year' },
  { id: 'academic_year_manage', module: 'Academic Setup', action: 'manage', code: 'academic_year_manage', name: 'Manage Academic Years', description: 'Create, edit, delete & set current academic year' },
  
  { id: 'academic_term_view', module: 'Academic Setup', action: 'view', code: 'academic_term_view', name: 'View Academic Terms', description: 'View academic terms and semesters' },
  { id: 'academic_term_create', module: 'Academic Setup', action: 'create', code: 'academic_term_create', name: 'Create Academic Term', description: 'Add new academic terms' },
  { id: 'academic_term_edit', module: 'Academic Setup', action: 'edit', code: 'academic_term_edit', name: 'Edit Academic Term', description: 'Modify academic terms' },
  { id: 'academic_term_inactive', module: 'Academic Setup', action: 'inactive', code: 'academic_term_inactive', name: 'Deactivate Academic Term', description: 'Deactivate academic terms' },
  { id: 'academic_term_active', module: 'Academic Setup', action: 'active', code: 'academic_term_active', name: 'Activate Academic Term', description: 'Activate academic terms' },
  { id: 'academic_term_manage', module: 'Academic Setup', action: 'manage', code: 'academic_term_manage', name: 'Manage Academic Terms', description: 'Create, edit, delete academic terms' },
  
  { id: 'grade_view', module: 'Academic Setup', action: 'view', code: 'grade_view', name: 'View Grades / Classes', description: 'View grade and class directory' },
  { id: 'grade_create', module: 'Academic Setup', action: 'create', code: 'grade_create', name: 'Create Grade / Class', description: 'Add new grade and class levels' },
  { id: 'grade_edit', module: 'Academic Setup', action: 'edit', code: 'grade_edit', name: 'Edit Grade / Class', description: 'Modify grade and class levels' },
  { id: 'grade_inactive', module: 'Academic Setup', action: 'inactive', code: 'grade_inactive', name: 'Deactivate Grade / Class', description: 'Deactivate grade and class levels' },
  { id: 'grade_active', module: 'Academic Setup', action: 'active', code: 'grade_active', name: 'Activate Grade / Class', description: 'Activate grade and class levels' },
  { id: 'grade_manage', module: 'Academic Setup', action: 'manage', code: 'grade_manage', name: 'Manage Grades / Classes', description: 'Create, edit, delete grades and classes' },
  
  { id: 'section_view', module: 'Academic Setup', action: 'view', code: 'section_view', name: 'View Sections', description: 'View class sections' },
  { id: 'section_create', module: 'Academic Setup', action: 'create', code: 'section_create', name: 'Create Section', description: 'Add new class sections' },
  { id: 'section_edit', module: 'Academic Setup', action: 'edit', code: 'section_edit', name: 'Edit Section', description: 'Modify class sections' },
  { id: 'section_inactive', module: 'Academic Setup', action: 'inactive', code: 'section_inactive', name: 'Deactivate Section', description: 'Deactivate class sections' },
  { id: 'section_active', module: 'Academic Setup', action: 'active', code: 'section_active', name: 'Activate Section', description: 'Activate class sections' },
  { id: 'section_manage', module: 'Academic Setup', action: 'manage', code: 'section_manage', name: 'Manage Sections', description: 'Create, edit, delete class sections' },
  
  { id: 'subject_view', module: 'Academic Setup', action: 'view', code: 'subject_view', name: 'View Master Subjects', description: 'View subject catalogue' },
  { id: 'subject_create', module: 'Academic Setup', action: 'create', code: 'subject_create', name: 'Create Master Subject', description: 'Add new master subjects' },
  { id: 'subject_edit', module: 'Academic Setup', action: 'edit', code: 'subject_edit', name: 'Edit Master Subject', description: 'Modify master subjects' },
  { id: 'subject_inactive', module: 'Academic Setup', action: 'inactive', code: 'subject_inactive', name: 'Deactivate Master Subject', description: 'Deactivate master subjects' },
  { id: 'subject_active', module: 'Academic Setup', action: 'active', code: 'subject_active', name: 'Activate Master Subject', description: 'Activate master subjects' },
  { id: 'subject_manage', module: 'Academic Setup', action: 'manage', code: 'subject_manage', name: 'Manage Master Subjects', description: 'Create, edit, delete master subjects' },
  
  { id: 'class_subject_view', module: 'Academic Setup', action: 'view', code: 'class_subject_view', name: 'View Class Subject Mapping', description: 'View class subject configurations' },
  { id: 'class_subject_edit', module: 'Academic Setup', action: 'edit', code: 'class_subject_edit', name: 'Edit Class Subjects', description: 'Configure and save class subjects' },
  { id: 'class_subject_manage', module: 'Academic Setup', action: 'manage', code: 'class_subject_manage', name: 'Configure Class Subjects', description: 'Configure subjects per class' },

  // System & Audit
  { id: 'settings_view', module: 'System & Audit', action: 'view', code: 'settings_view', name: 'View System Settings', description: 'View system configuration parameters' },
  { id: 'settings_manage', module: 'System & Audit', action: 'manage', code: 'settings_manage', name: 'Manage System Settings', description: 'Update system settings and policies' },
  { id: 'audit_view', module: 'System & Audit', action: 'view', code: 'audit_view', name: 'View Audit Logs', description: 'View system audit trail and logs' },

  // Phase 3: Timetable & Academic Operations
  { id: 'period_view', module: 'Academic Operations', action: 'view', code: 'period_view', name: 'View Periods', description: 'View bell schedule period definitions' },
  { id: 'period_manage', module: 'Academic Operations', action: 'manage', code: 'period_manage', name: 'Manage Periods', description: 'Configure bell schedule periods' },
  { id: 'timetable_view', module: 'Academic Operations', action: 'view', code: 'timetable_view', name: 'View Timetable', description: 'View class and teacher timetables' },
  { id: 'timetable_manage', module: 'Academic Operations', action: 'manage', code: 'timetable_manage', name: 'Manage Timetable', description: 'Create and edit timetable matrix entries' },
  { id: 'timetable_generate', module: 'Academic Operations', action: 'manage', code: 'timetable_generate', name: 'Generate Timetable', description: 'Run the Smart Timetable Generator, including regenerate section/subject' },
  { id: 'timetable_publish', module: 'Academic Operations', action: 'manage', code: 'timetable_publish', name: 'Publish Timetable', description: 'Publish a saved/generated timetable as the official schedule' },
  { id: 'timetable_lock', module: 'Academic Operations', action: 'manage', code: 'timetable_lock', name: 'Lock Timetable', description: 'Lock or unlock individual timetable slots to protect them from edits and regeneration' },
  { id: 'room_view', module: 'Academic Operations', action: 'view', code: 'room_view', name: 'View Rooms', description: 'View rooms and labs used for scheduling' },
  { id: 'room_manage', module: 'Academic Operations', action: 'manage', code: 'room_manage', name: 'Manage Rooms', description: 'Configure rooms and labs' },

  // Phase 3: Attendance Engine
  { id: 'attendance_view', module: 'Attendance & Leave', action: 'view', code: 'attendance_view', name: 'View Attendance', description: 'View student attendance summaries and sessions' },
  { id: 'attendance_mark', module: 'Attendance & Leave', action: 'mark', code: 'attendance_mark', name: 'Mark Attendance', description: 'Take and submit daily/period attendance' },
  { id: 'attendance_correct', module: 'Attendance & Leave', action: 'correct', code: 'attendance_correct', name: 'Correct Attendance', description: 'Audit correct attendance with mandatory reason' },
  { id: 'attendance_report', module: 'Attendance & Leave', action: 'report', code: 'attendance_report', name: 'Attendance Dashboard', description: 'Access school-wide attendance analytics' },
  { id: 'attendance_status_view', module: 'Attendance & Leave', action: 'view', code: 'attendance_status_view', name: 'View Statuses', description: 'View master attendance statuses' },
  { id: 'attendance_status_manage', module: 'Attendance & Leave', action: 'manage', code: 'attendance_status_manage', name: 'Manage Statuses', description: 'Configure master attendance statuses' },

  // Phase 3: Student Leave Management
  { id: 'leave_view', module: 'Attendance & Leave', action: 'view', code: 'leave_view', name: 'View Leave Requests', description: 'View student leave applications' },
  { id: 'leave_create', module: 'Attendance & Leave', action: 'create', code: 'leave_create', name: 'Apply Student Leave', description: 'Submit student leave request' },
  { id: 'leave_approve', module: 'Attendance & Leave', action: 'approve', code: 'leave_approve', name: 'Approve Student Leave', description: 'Approve or reject student leave' },

  // Phase 5: Fees & Financial Operations (UNDERSCORE-ONLY PERMISSIONS)
  { id: 'fee_category_view', module: 'Finance & Fees', action: 'view', code: 'fee_category_view', name: 'View Fee Categories', description: 'View fee categories catalogue' },
  { id: 'fee_category_create', module: 'Finance & Fees', action: 'create', code: 'fee_category_create', name: 'Create Fee Category', description: 'Create new fee categories' },
  { id: 'fee_category_update', module: 'Finance & Fees', action: 'update', code: 'fee_category_update', name: 'Update Fee Category', description: 'Modify fee category parameters' },
  { id: 'fee_category_delete', module: 'Finance & Fees', action: 'delete', code: 'fee_category_delete', name: 'Delete Fee Category', description: 'Deactivate fee categories' },
  { id: 'fee_category_manage', module: 'Finance & Fees', action: 'manage', code: 'fee_category_manage', name: 'Manage Fee Categories', description: 'Full fee category management' },

  { id: 'fee_structure_view', module: 'Finance & Fees', action: 'view', code: 'fee_structure_view', name: 'View Fee Structures', description: 'View grade-wise fee structures' },
  { id: 'fee_structure_create', module: 'Finance & Fees', action: 'create', code: 'fee_structure_create', name: 'Create Fee Structure', description: 'Create grade fee structures' },
  { id: 'fee_structure_update', module: 'Finance & Fees', action: 'update', code: 'fee_structure_update', name: 'Update Fee Structure', description: 'Modify fee structure items' },
  { id: 'fee_structure_delete', module: 'Finance & Fees', action: 'delete', code: 'fee_structure_delete', name: 'Delete Fee Structure', description: 'Deactivate fee structures' },
  { id: 'fee_structure_manage', module: 'Finance & Fees', action: 'manage', code: 'fee_structure_manage', name: 'Manage Fee Structures', description: 'Full fee structure administration' },

  { id: 'fee_assignment_view', module: 'Finance & Fees', action: 'view', code: 'fee_assignment_view', name: 'View Student Fee Assignments', description: 'View assigned student fee structures' },
  { id: 'fee_assignment_create', module: 'Finance & Fees', action: 'create', code: 'fee_assignment_create', name: 'Assign Fees', description: 'Assign fee structures to students' },
  { id: 'fee_assignment_update', module: 'Finance & Fees', action: 'update', code: 'fee_assignment_update', name: 'Update Fee Assignment', description: 'Update student fee assignments' },
  { id: 'fee_assignment_delete', module: 'Finance & Fees', action: 'delete', code: 'fee_assignment_delete', name: 'Delete Fee Assignment', description: 'Remove fee assignment' },
  { id: 'fee_assignment_manage', module: 'Finance & Fees', action: 'manage', code: 'fee_assignment_manage', name: 'Manage Fee Assignments', description: 'Full fee assignment management' },

  { id: 'concession_view', module: 'Finance & Fees', action: 'view', code: 'concession_view', name: 'View Concessions', description: 'View student fee concessions' },
  { id: 'concession_create', module: 'Finance & Fees', action: 'create', code: 'concession_create', name: 'Create Concession', description: 'Apply for fee concession' },
  { id: 'concession_update', module: 'Finance & Fees', action: 'update', code: 'concession_update', name: 'Update Concession', description: 'Modify fee concession' },
  { id: 'concession_approve', module: 'Finance & Fees', action: 'approve', code: 'concession_approve', name: 'Approve Concession', description: 'Approve or reject fee concessions' },
  { id: 'concession_reject', module: 'Finance & Fees', action: 'reject', code: 'concession_reject', name: 'Reject Concession', description: 'Reject fee concessions' },
  { id: 'concession_manage', module: 'Finance & Fees', action: 'manage', code: 'concession_manage', name: 'Manage Concessions', description: 'Full concession management' },

  { id: 'discount_view', module: 'Finance & Fees', action: 'view', code: 'discount_view', name: 'View Discounts', description: 'View discount policies' },
  { id: 'discount_create', module: 'Finance & Fees', action: 'create', code: 'discount_create', name: 'Create Discount', description: 'Create discount rules' },
  { id: 'discount_update', module: 'Finance & Fees', action: 'update', code: 'discount_update', name: 'Update Discount', description: 'Modify discount rules' },
  { id: 'discount_delete', module: 'Finance & Fees', action: 'delete', code: 'discount_delete', name: 'Delete Discount', description: 'Deactivate discount rules' },
  { id: 'discount_manage', module: 'Finance & Fees', action: 'manage', code: 'discount_manage', name: 'Manage Discounts', description: 'Full discount management' },

  { id: 'fine_rule_view', module: 'Finance & Fees', action: 'view', code: 'fine_rule_view', name: 'View Fine Rules', description: 'View fine and late penalty rules' },
  { id: 'fine_rule_create', module: 'Finance & Fees', action: 'create', code: 'fine_rule_create', name: 'Create Fine Rule', description: 'Create late fine rules' },
  { id: 'fine_rule_update', module: 'Finance & Fees', action: 'update', code: 'fine_rule_update', name: 'Update Fine Rule', description: 'Modify late fine rules' },
  { id: 'fine_rule_delete', module: 'Finance & Fees', action: 'delete', code: 'fine_rule_delete', name: 'Delete Fine Rule', description: 'Deactivate fine rules' },
  { id: 'fine_rule_manage', module: 'Finance & Fees', action: 'manage', code: 'fine_rule_manage', name: 'Manage Fine Rules', description: 'Full fine rules management' },

  { id: 'invoice_view', module: 'Finance & Billing', action: 'view', code: 'invoice_view', name: 'View Invoices', description: 'View student fee invoices' },
  { id: 'invoice_create', module: 'Finance & Billing', action: 'create', code: 'invoice_create', name: 'Generate Invoices', description: 'Generate single and bulk invoices' },
  { id: 'invoice_update', module: 'Finance & Billing', action: 'update', code: 'invoice_update', name: 'Update Invoice', description: 'Update invoice status and details' },
  { id: 'invoice_cancel', module: 'Finance & Billing', action: 'cancel', code: 'invoice_cancel', name: 'Cancel Invoice', description: 'Cancel draft invoices' },
  { id: 'invoice_void', module: 'Finance & Billing', action: 'void', code: 'invoice_void', name: 'Void Invoice', description: 'Void issued invoices with reversal' },
  { id: 'invoice_manage', module: 'Finance & Billing', action: 'manage', code: 'invoice_manage', name: 'Manage Invoices', description: 'Full invoice management' },

  { id: 'payment_view', module: 'Finance & Billing', action: 'view', code: 'payment_view', name: 'View Payments', description: 'View fee payment history' },
  { id: 'payment_create', module: 'Finance & Billing', action: 'create', code: 'payment_create', name: 'Collect Payment', description: 'Process and collect fee payments' },
  { id: 'payment_update', module: 'Finance & Billing', action: 'update', code: 'payment_update', name: 'Update Payment', description: 'Update payment notes and reference' },
  { id: 'payment_cancel', module: 'Finance & Billing', action: 'cancel', code: 'payment_cancel', name: 'Cancel Payment', description: 'Cancel pending payments' },
  { id: 'payment_manage', module: 'Finance & Billing', action: 'manage', code: 'payment_manage', name: 'Manage Payments', description: 'Full payment administration' },

  { id: 'payment_allocation_view', module: 'Finance & Billing', action: 'view', code: 'payment_allocation_view', name: 'View Allocations', description: 'View payment-to-invoice allocations' },
  { id: 'payment_allocation_create', module: 'Finance & Billing', action: 'create', code: 'payment_allocation_create', name: 'Allocate Payment', description: 'Allocate payment to invoices' },
  { id: 'payment_allocation_update', module: 'Finance & Billing', action: 'update', code: 'payment_allocation_update', name: 'Update Allocation', description: 'Modify allocation' },
  { id: 'payment_allocation_manage', module: 'Finance & Billing', action: 'manage', code: 'payment_allocation_manage', name: 'Manage Allocations', description: 'Full allocation management' },

  { id: 'receipt_view', module: 'Finance & Billing', action: 'view', code: 'receipt_view', name: 'View Receipts', description: 'View payment receipts' },
  { id: 'receipt_generate', module: 'Finance & Billing', action: 'generate', code: 'receipt_generate', name: 'Generate Receipts', description: 'Generate fee receipts' },
  { id: 'receipt_download', module: 'Finance & Billing', action: 'download', code: 'receipt_download', name: 'Download Receipts', description: 'Download receipt PDFs' },
  { id: 'receipt_manage', module: 'Finance & Billing', action: 'manage', code: 'receipt_manage', name: 'Manage Receipts', description: 'Full receipt administration' },

  { id: 'refund_view', module: 'Finance & Refunds', action: 'view', code: 'refund_view', name: 'View Refunds', description: 'View refund requests and history' },
  { id: 'refund_create', module: 'Finance & Refunds', action: 'create', code: 'refund_create', name: 'Request Refund', description: 'Submit fee refund request' },
  { id: 'refund_approve', module: 'Finance & Refunds', action: 'approve', code: 'refund_approve', name: 'Approve Refund', description: 'Approve or reject fee refunds' },
  { id: 'refund_reject', module: 'Finance & Refunds', action: 'reject', code: 'refund_reject', name: 'Reject Refund', description: 'Reject refund requests' },
  { id: 'refund_process', module: 'Finance & Refunds', action: 'process', code: 'refund_process', name: 'Process Refund', description: 'Disburse approved fee refunds' },
  { id: 'refund_manage', module: 'Finance & Refunds', action: 'manage', code: 'refund_manage', name: 'Manage Refunds', description: 'Full refund administration' },

  { id: 'ledger_view', module: 'Finance & Ledger', action: 'view', code: 'ledger_view', name: 'View Student Ledger', description: 'View append-only student financial ledgers' },
  { id: 'ledger_export', module: 'Finance & Ledger', action: 'export', code: 'ledger_export', name: 'Export Ledger', description: 'Export student ledger history' },
  { id: 'ledger_adjust', module: 'Finance & Ledger', action: 'adjust', code: 'ledger_adjust', name: 'Adjust Ledger', description: 'Make compensating ledger adjustments' },
  { id: 'ledger_manage', module: 'Finance & Ledger', action: 'manage', code: 'ledger_manage', name: 'Manage Ledger', description: 'Full ledger management' },

  { id: 'financial_adjustment_view', module: 'Finance & Ledger', action: 'view', code: 'financial_adjustment_view', name: 'View Adjustments', description: 'View financial credit and debit adjustments' },
  { id: 'financial_adjustment_create', module: 'Finance & Ledger', action: 'create', code: 'financial_adjustment_create', name: 'Create Adjustment', description: 'Apply manual financial adjustment' },
  { id: 'financial_adjustment_approve', module: 'Finance & Ledger', action: 'approve', code: 'financial_adjustment_approve', name: 'Approve Adjustment', description: 'Approve financial adjustments' },
  { id: 'financial_adjustment_reject', module: 'Finance & Ledger', action: 'reject', code: 'financial_adjustment_reject', name: 'Reject Adjustment', description: 'Reject financial adjustments' },
  { id: 'financial_adjustment_manage', module: 'Finance & Ledger', action: 'manage', code: 'financial_adjustment_manage', name: 'Manage Adjustments', description: 'Full adjustment management' },

  { id: 'finance_dashboard_view', module: 'Finance Reporting', action: 'view', code: 'finance_dashboard_view', name: 'View Finance Dashboard', description: 'Access executive financial dashboard and KPIs' },
  { id: 'finance_report_view', module: 'Finance Reporting', action: 'view', code: 'finance_report_view', name: 'View Financial Reports', description: 'Generate fee collection and outstanding reports' },
  { id: 'finance_report_export', module: 'Finance Reporting', action: 'export', code: 'finance_report_export', name: 'Export Financial Reports', description: 'Export financial reports to CSV/Excel/PDF' },

  // Phase 6: Portals, Communication & Notifications (UNDERSCORE-ONLY PERMISSIONS)
  { id: 'announcement_view', module: 'Communications', action: 'view', code: 'announcement_view', name: 'View Announcements', description: 'View school and class announcements' },
  { id: 'announcement_create', module: 'Communications', action: 'create', code: 'announcement_create', name: 'Create Announcement', description: 'Create draft announcements' },
  { id: 'announcement_update', module: 'Communications', action: 'update', code: 'announcement_update', name: 'Update Announcement', description: 'Modify draft announcements' },
  { id: 'announcement_delete', module: 'Communications', action: 'delete', code: 'announcement_delete', name: 'Delete Announcement', description: 'Remove announcements' },
  { id: 'announcement_publish', module: 'Communications', action: 'publish', code: 'announcement_publish', name: 'Publish Announcement', description: 'Publish announcements to audience' },
  { id: 'announcement_schedule', module: 'Communications', action: 'schedule', code: 'announcement_schedule', name: 'Schedule Announcement', description: 'Schedule future publication' },
  { id: 'announcement_cancel', module: 'Communications', action: 'cancel', code: 'announcement_cancel', name: 'Cancel Announcement', description: 'Cancel scheduled announcements' },
  { id: 'announcement_manage', module: 'Communications', action: 'manage', code: 'announcement_manage', name: 'Manage Announcements', description: 'Full announcement administration' },

  { id: 'notification_view', module: 'Notifications', action: 'view', code: 'notification_view', name: 'View Notifications', description: 'View user notifications' },
  { id: 'notification_mark_read', module: 'Notifications', action: 'mark_read', code: 'notification_mark_read', name: 'Mark Read', description: 'Mark notifications as read' },
  { id: 'notification_manage', module: 'Notifications', action: 'manage', code: 'notification_manage', name: 'Manage Notifications', description: 'Full notification management' },
  { id: 'notification_send', module: 'Notifications', action: 'send', code: 'notification_send', name: 'Send Notification', description: 'Dispatch manual notification' },

  { id: 'notification_preference_view', module: 'Notifications', action: 'view', code: 'notification_preference_view', name: 'View Notification Preferences', description: 'View notification channels' },
  { id: 'notification_preference_update', module: 'Notifications', action: 'update', code: 'notification_preference_update', name: 'Update Notification Preferences', description: 'Modify channel preferences' },
  { id: 'notification_preference_manage', module: 'Notifications', action: 'manage', code: 'notification_preference_manage', name: 'Manage Notification Preferences', description: 'Full preferences management' },

  { id: 'notification_template_view', module: 'Notifications', action: 'view', code: 'notification_template_view', name: 'View Templates', description: 'View notification templates' },
  { id: 'notification_template_create', module: 'Notifications', action: 'create', code: 'notification_template_create', name: 'Create Template', description: 'Create notification template' },
  { id: 'notification_template_update', module: 'Notifications', action: 'update', code: 'notification_template_update', name: 'Update Template', description: 'Modify notification template' },
  { id: 'notification_template_delete', module: 'Notifications', action: 'delete', code: 'notification_template_delete', name: 'Delete Template', description: 'Deactivate notification template' },
  { id: 'notification_template_manage', module: 'Notifications', action: 'manage', code: 'notification_template_manage', name: 'Manage Templates', description: 'Full template management' },

  { id: 'notification_delivery_view', module: 'Notifications', action: 'view', code: 'notification_delivery_view', name: 'View Delivery Logs', description: 'View notification delivery status' },
  { id: 'notification_delivery_retry', module: 'Notifications', action: 'retry', code: 'notification_delivery_retry', name: 'Retry Delivery', description: 'Retry failed notification delivery' },
  { id: 'notification_delivery_manage', module: 'Notifications', action: 'manage', code: 'notification_delivery_manage', name: 'Manage Delivery', description: 'Full delivery management' },

  { id: 'parent_portal_view', module: 'Portals', action: 'view', code: 'parent_portal_view', name: 'Access Parent Portal', description: 'Access parent portal workspace' },
  { id: 'parent_portal_manage', module: 'Portals', action: 'manage', code: 'parent_portal_manage', name: 'Manage Parent Portal', description: 'Manage parent portal configuration' },

  { id: 'teacher_portal_view', module: 'Portals', action: 'view', code: 'teacher_portal_view', name: 'Access Teacher Portal', description: 'Access teacher workspace' },
  { id: 'teacher_portal_manage', module: 'Portals', action: 'manage', code: 'teacher_portal_manage', name: 'Manage Teacher Portal', description: 'Manage teacher portal configuration' },

  { id: 'student_portal_view', module: 'Portals', action: 'view', code: 'student_portal_view', name: 'Access Student Portal', description: 'Access student workspace' },
  { id: 'student_portal_manage', module: 'Portals', action: 'manage', code: 'student_portal_manage', name: 'Manage Student Portal', description: 'Manage student portal configuration' },

  { id: 'communication_dashboard_view', module: 'Communications', action: 'view', code: 'communication_dashboard_view', name: 'View Communication Center', description: 'Access communication center analytics' },
  { id: 'communication_report_view', module: 'Communications', action: 'view', code: 'communication_report_view', name: 'View Communication Reports', description: 'View notification volume and delivery reports' },
  { id: 'communication_report_export', module: 'Communications', action: 'export', code: 'communication_report_export', name: 'Export Communication Reports', description: 'Export delivery analytics' },

  { id: 'message_view', module: 'Messaging', action: 'view', code: 'message_view', name: 'View Messages', description: 'View conversation messages' },
  { id: 'message_send', module: 'Messaging', action: 'send', code: 'message_send', name: 'Send Message', description: 'Send secure messages' },
  { id: 'message_delete', module: 'Messaging', action: 'delete', code: 'message_delete', name: 'Delete Message', description: 'Hide or delete messages' },
  { id: 'message_manage', module: 'Messaging', action: 'manage', code: 'message_manage', name: 'Manage Messaging', description: 'Full messaging management' },

  // Phase 7: Transport Management
  { id: 'vehicle_view', module: 'Transport', action: 'view', code: 'vehicle_view', name: 'View Vehicles', description: 'View vehicle fleet' },
  { id: 'vehicle_create', module: 'Transport', action: 'create', code: 'vehicle_create', name: 'Create Vehicle', description: 'Add new vehicle' },
  { id: 'vehicle_update', module: 'Transport', action: 'update', code: 'vehicle_update', name: 'Update Vehicle', description: 'Modify vehicle details' },
  { id: 'vehicle_delete', module: 'Transport', action: 'delete', code: 'vehicle_delete', name: 'Delete Vehicle', description: 'Deactivate vehicle' },
  { id: 'vehicle_manage', module: 'Transport', action: 'manage', code: 'vehicle_manage', name: 'Manage Vehicles', description: 'Full vehicle fleet management' },

  { id: 'driver_view', module: 'Transport', action: 'view', code: 'driver_view', name: 'View Drivers', description: 'View transport drivers' },
  { id: 'driver_create', module: 'Transport', action: 'create', code: 'driver_create', name: 'Create Driver', description: 'Register transport driver' },
  { id: 'driver_update', module: 'Transport', action: 'update', code: 'driver_update', name: 'Update Driver', description: 'Modify driver profile' },
  { id: 'driver_delete', module: 'Transport', action: 'delete', code: 'driver_delete', name: 'Delete Driver', description: 'Deactivate driver' },
  { id: 'driver_manage', module: 'Transport', action: 'manage', code: 'driver_manage', name: 'Manage Drivers', description: 'Full driver management' },

  { id: 'route_view', module: 'Transport', action: 'view', code: 'route_view', name: 'View Transport Routes', description: 'View routes and stops' },
  { id: 'route_create', module: 'Transport', action: 'create', code: 'route_create', name: 'Create Route', description: 'Configure transport route' },
  { id: 'route_update', module: 'Transport', action: 'update', code: 'route_update', name: 'Update Route', description: 'Modify transport route' },
  { id: 'route_delete', module: 'Transport', action: 'delete', code: 'route_delete', name: 'Delete Route', description: 'Deactivate transport route' },
  { id: 'route_manage', module: 'Transport', action: 'manage', code: 'route_manage', name: 'Manage Routes', description: 'Full route management' },

  { id: 'transport_assignment_view', module: 'Transport', action: 'view', code: 'transport_assignment_view', name: 'View Assignments', description: 'View student transport assignments' },
  { id: 'transport_assignment_create', module: 'Transport', action: 'create', code: 'transport_assignment_create', name: 'Assign Transport', description: 'Assign student to route' },
  { id: 'transport_assignment_update', module: 'Transport', action: 'update', code: 'transport_assignment_update', name: 'Update Assignment', description: 'Modify transport assignment' },
  { id: 'transport_assignment_delete', module: 'Transport', action: 'delete', code: 'transport_assignment_delete', name: 'Delete Assignment', description: 'Cancel transport assignment' },
  { id: 'transport_assignment_manage', module: 'Transport', action: 'manage', code: 'transport_assignment_manage', name: 'Manage Assignments', description: 'Full assignment management' },

  { id: 'transport_attendance_view', module: 'Transport', action: 'view', code: 'transport_attendance_view', name: 'View Transport Attendance', description: 'View daily bus attendance' },
  { id: 'transport_attendance_mark', module: 'Transport', action: 'mark', code: 'transport_attendance_mark', name: 'Mark Transport Attendance', description: 'Record student pickup/drop' },
  { id: 'transport_attendance_update', module: 'Transport', action: 'update', code: 'transport_attendance_update', name: 'Update Transport Attendance', description: 'Modify transport attendance' },
  { id: 'transport_attendance_manage', module: 'Transport', action: 'manage', code: 'transport_attendance_manage', name: 'Manage Transport Attendance', description: 'Full transport attendance management' },

  { id: 'transport_report_view', module: 'Transport', action: 'view', code: 'transport_report_view', name: 'View Transport Reports', description: 'View transport utilization reports' },
  { id: 'transport_report_export', module: 'Transport', action: 'export', code: 'transport_report_export', name: 'Export Transport Reports', description: 'Export transport reports' },

  // Phase 7: Library Management
  { id: 'library_view', module: 'Library', action: 'view', code: 'library_view', name: 'View Libraries', description: 'View school libraries' },
  { id: 'library_create', module: 'Library', action: 'create', code: 'library_create', name: 'Create Library', description: 'Add new library' },
  { id: 'library_update', module: 'Library', action: 'update', code: 'library_update', name: 'Update Library', description: 'Modify library details' },
  { id: 'library_delete', module: 'Library', action: 'delete', code: 'library_delete', name: 'Delete Library', description: 'Deactivate library' },
  { id: 'library_manage', module: 'Library', action: 'manage', code: 'library_manage', name: 'Manage Libraries', description: 'Full library management' },

  { id: 'book_view', module: 'Library', action: 'view', code: 'book_view', name: 'View Books Catalogue', description: 'View library books' },
  { id: 'book_create', module: 'Library', action: 'create', code: 'book_create', name: 'Create Book', description: 'Add book to catalogue' },
  { id: 'book_update', module: 'Library', action: 'update', code: 'book_update', name: 'Update Book', description: 'Modify book details' },
  { id: 'book_delete', module: 'Library', action: 'delete', code: 'book_delete', name: 'Delete Book', description: 'Deactivate book' },
  { id: 'book_manage', module: 'Library', action: 'manage', code: 'book_manage', name: 'Manage Books', description: 'Full catalogue management' },

  { id: 'book_copy_view', module: 'Library', action: 'view', code: 'book_copy_view', name: 'View Book Copies', description: 'View physical copies' },
  { id: 'book_copy_create', module: 'Library', action: 'create', code: 'book_copy_create', name: 'Create Book Copy', description: 'Add accession copy' },
  { id: 'book_copy_update', module: 'Library', action: 'update', code: 'book_copy_update', name: 'Update Book Copy', description: 'Modify copy status' },
  { id: 'book_copy_delete', module: 'Library', action: 'delete', code: 'book_copy_delete', name: 'Delete Book Copy', description: 'Retire book copy' },
  { id: 'book_copy_manage', module: 'Library', action: 'manage', code: 'book_copy_manage', name: 'Manage Book Copies', description: 'Full copy management' },

  { id: 'library_member_view', module: 'Library', action: 'view', code: 'library_member_view', name: 'View Library Members', description: 'View member directory' },
  { id: 'library_member_create', module: 'Library', action: 'create', code: 'library_member_create', name: 'Create Member', description: 'Register library member' },
  { id: 'library_member_update', module: 'Library', action: 'update', code: 'library_member_update', name: 'Update Member', description: 'Modify member details' },
  { id: 'library_member_delete', module: 'Library', action: 'delete', code: 'library_member_delete', name: 'Delete Member', description: 'Deactivate member' },
  { id: 'library_member_manage', module: 'Library', action: 'manage', code: 'library_member_manage', name: 'Manage Members', description: 'Full member management' },

  { id: 'book_issue_view', module: 'Library', action: 'view', code: 'book_issue_view', name: 'View Book Issues', description: 'View active loan issues' },
  { id: 'book_issue_create', module: 'Library', action: 'create', code: 'book_issue_create', name: 'Issue Book', description: 'Issue book copy to member' },
  { id: 'book_issue_update', module: 'Library', action: 'update', code: 'book_issue_update', name: 'Update Book Issue', description: 'Modify issue details' },
  { id: 'book_issue_return', module: 'Library', action: 'return', code: 'book_issue_return', name: 'Return Book', description: 'Process book return and fine' },
  { id: 'book_issue_cancel', module: 'Library', action: 'cancel', code: 'book_issue_cancel', name: 'Cancel Issue', description: 'Cancel book issue' },
  { id: 'book_issue_manage', module: 'Library', action: 'manage', code: 'book_issue_manage', name: 'Manage Issues', description: 'Full circulation management' },

  { id: 'library_fine_view', module: 'Library', action: 'view', code: 'library_fine_view', name: 'View Fines', description: 'View overdue fines' },
  { id: 'library_fine_create', module: 'Library', action: 'create', code: 'library_fine_create', name: 'Apply Fine', description: 'Apply manual library fine' },
  { id: 'library_fine_update', module: 'Library', action: 'update', code: 'library_fine_update', name: 'Update Fine', description: 'Modify fine status' },
  { id: 'library_fine_adjust', module: 'Library', action: 'adjust', code: 'library_fine_adjust', name: 'Waive / Adjust Fine', description: 'Waive or adjust library fine' },
  { id: 'library_fine_manage', module: 'Library', action: 'manage', code: 'library_fine_manage', name: 'Manage Fines', description: 'Full fine administration' },

  { id: 'library_report_view', module: 'Library', action: 'view', code: 'library_report_view', name: 'View Library Reports', description: 'View library circulation reports' },
  { id: 'library_report_export', module: 'Library', action: 'export', code: 'library_report_export', name: 'Export Library Reports', description: 'Export library reports' },

  // Phase 7: Document Management
  { id: 'document_view', module: 'Documents', action: 'view', code: 'document_view', name: 'View Documents', description: 'View system documents' },
  { id: 'document_create', module: 'Documents', action: 'create', code: 'document_create', name: 'Create Document', description: 'Register document entry' },
  { id: 'document_update', module: 'Documents', action: 'update', code: 'document_update', name: 'Update Document', description: 'Modify document details' },
  { id: 'document_delete', module: 'Documents', action: 'delete', code: 'document_delete', name: 'Delete Document', description: 'Remove document' },
  { id: 'document_upload', module: 'Documents', action: 'upload', code: 'document_upload', name: 'Upload Document', description: 'Upload file to storage' },
  { id: 'document_verify', module: 'Documents', action: 'verify', code: 'document_verify', name: 'Verify Document', description: 'Verify or reject document' },
  { id: 'document_reject', module: 'Documents', action: 'reject', code: 'document_reject', name: 'Reject Document', description: 'Reject document upload' },
  { id: 'document_archive', module: 'Documents', action: 'archive', code: 'document_archive', name: 'Archive Document', description: 'Archive old document version' },
  { id: 'document_download', module: 'Documents', action: 'download', code: 'document_download', name: 'Download Document', description: 'Download document file' },
  { id: 'document_manage', module: 'Documents', action: 'manage', code: 'document_manage', name: 'Manage Documents', description: 'Full document administration' },

  // Phase 7: Reports & Analytics & Exports
  { id: 'report_view', module: 'Reports', action: 'view', code: 'report_view', name: 'View Reports', description: 'View report definitions' },
  { id: 'report_create', module: 'Reports', action: 'create', code: 'report_create', name: 'Create Report', description: 'Add custom report definition' },
  { id: 'report_update', module: 'Reports', action: 'update', code: 'report_update', name: 'Update Report', description: 'Modify report definition' },
  { id: 'report_delete', module: 'Reports', action: 'delete', code: 'report_delete', name: 'Delete Report', description: 'Deactivate report definition' },
  { id: 'report_generate', module: 'Reports', action: 'generate', code: 'report_generate', name: 'Generate Report', description: 'Execute report query' },
  { id: 'report_export', module: 'Reports', action: 'export', code: 'report_export', name: 'Export Report', description: 'Export report data' },
  { id: 'report_manage', module: 'Reports', action: 'manage', code: 'report_manage', name: 'Manage Reports', description: 'Full report engine management' },

  { id: 'report_schedule_view', module: 'Reports', action: 'view', code: 'report_schedule_view', name: 'View Schedules', description: 'View scheduled reports' },
  { id: 'report_schedule_create', module: 'Reports', action: 'create', code: 'report_schedule_create', name: 'Create Schedule', description: 'Schedule recurring report' },
  { id: 'report_schedule_update', module: 'Reports', action: 'update', code: 'report_schedule_update', name: 'Update Schedule', description: 'Modify report schedule' },
  { id: 'report_schedule_delete', module: 'Reports', action: 'delete', code: 'report_schedule_delete', name: 'Delete Schedule', description: 'Cancel report schedule' },
  { id: 'report_schedule_manage', module: 'Reports', action: 'manage', code: 'report_schedule_manage', name: 'Manage Schedules', description: 'Full schedule management' },

  { id: 'analytics_dashboard_view', module: 'Analytics', action: 'view', code: 'analytics_dashboard_view', name: 'View Executive Analytics', description: 'Access executive analytics dashboard' },
  { id: 'academic_analytics_view', module: 'Analytics', action: 'view', code: 'academic_analytics_view', name: 'View Academic Analytics', description: 'Access academic performance analytics' },
  { id: 'attendance_analytics_view', module: 'Analytics', action: 'view', code: 'attendance_analytics_view', name: 'View Attendance Analytics', description: 'Access attendance analytics' },
  { id: 'finance_analytics_view', module: 'Analytics', action: 'view', code: 'finance_analytics_view', name: 'View Finance Analytics', description: 'Access finance analytics' },
  { id: 'transport_analytics_view', module: 'Analytics', action: 'view', code: 'transport_analytics_view', name: 'View Transport Analytics', description: 'Access transport analytics' },
  { id: 'library_analytics_view', module: 'Analytics', action: 'view', code: 'library_analytics_view', name: 'View Library Analytics', description: 'Access library analytics' },
  { id: 'communication_analytics_view', module: 'Analytics', action: 'view', code: 'communication_analytics_view', name: 'View Communication Analytics', description: 'Access communication analytics' },

  { id: 'export_view', module: 'Exports', action: 'view', code: 'export_view', name: 'View Export Jobs', description: 'View export history' },
  { id: 'export_create', module: 'Exports', action: 'create', code: 'export_create', name: 'Create Export Job', description: 'Request data export' },
  { id: 'export_download', module: 'Exports', action: 'download', code: 'export_download', name: 'Download Export', description: 'Download generated export file' },
  { id: 'export_cancel', module: 'Exports', action: 'cancel', code: 'export_cancel', name: 'Cancel Export', description: 'Cancel export job' },
  { id: 'export_manage', module: 'Exports', action: 'manage', code: 'export_manage', name: 'Manage Exports', description: 'Full export management' },

  // Phase 8: HRMS
  { id: 'department_view', module: 'HRMS', action: 'view', code: 'department_view', name: 'View Departments', description: 'View department directory' },
  { id: 'department_manage', module: 'HRMS', action: 'manage', code: 'department_manage', name: 'Manage Departments', description: 'Create and edit departments' },
  { id: 'designation_view', module: 'HRMS', action: 'view', code: 'designation_view', name: 'View Designations', description: 'View designations' },
  { id: 'designation_manage', module: 'HRMS', action: 'manage', code: 'designation_manage', name: 'Manage Designations', description: 'Create and edit designations' },
  { id: 'employment_profile_view', module: 'HRMS', action: 'view', code: 'employment_profile_view', name: 'View Employment Profiles', description: 'View staff employment details' },
  { id: 'employment_profile_manage', module: 'HRMS', action: 'manage', code: 'employment_profile_manage', name: 'Manage Employment Profiles', description: 'Create and update employment records' },
  { id: 'staff_attendance_view', module: 'HRMS', action: 'view', code: 'staff_attendance_view', name: 'View Staff Attendance', description: 'View staff attendance records' },
  { id: 'staff_attendance_mark', module: 'HRMS', action: 'mark', code: 'staff_attendance_mark', name: 'Mark Staff Attendance', description: 'Mark daily staff attendance' },
  { id: 'leave_type_view', module: 'HRMS', action: 'view', code: 'leave_type_view', name: 'View Leave Types', description: 'View leave type definitions' },
  { id: 'leave_type_manage', module: 'HRMS', action: 'manage', code: 'leave_type_manage', name: 'Manage Leave Types', description: 'Create and edit leave types' },
  { id: 'leave_balance_view', module: 'HRMS', action: 'view', code: 'leave_balance_view', name: 'View Leave Balances', description: 'View staff leave balances' },
  { id: 'leave_balance_manage', module: 'HRMS', action: 'manage', code: 'leave_balance_manage', name: 'Manage Leave Balances', description: 'Credit leave balances' },
  { id: 'staff_leave_view', module: 'HRMS', action: 'view', code: 'staff_leave_view', name: 'View Staff Leave Requests', description: 'View staff leave applications' },
  { id: 'staff_leave_apply', module: 'HRMS', action: 'apply', code: 'staff_leave_apply', name: 'Apply Staff Leave', description: 'Submit staff leave request' },
  { id: 'staff_leave_approve', module: 'HRMS', action: 'approve', code: 'staff_leave_approve', name: 'Approve Staff Leave', description: 'Approve or reject staff leave' },
  // Phase 8: Payroll
  { id: 'payroll_view', module: 'Payroll', action: 'view', code: 'payroll_view', name: 'View Payroll', description: 'View payroll components and periods' },
  { id: 'payroll_manage', module: 'Payroll', action: 'manage', code: 'payroll_manage', name: 'Manage Payroll', description: 'Create salary structures and assignments' },
  { id: 'payroll_process', module: 'Payroll', action: 'process', code: 'payroll_process', name: 'Process Payroll', description: 'Run payroll calculation engine' },
  { id: 'payroll_lock', module: 'Payroll', action: 'lock', code: 'payroll_lock', name: 'Lock Payroll', description: 'Lock payroll period and generate payslips' },
  { id: 'payslip_view', module: 'Payroll', action: 'view', code: 'payslip_view', name: 'View Payslips', description: 'View employee payslips' },
  // Phase 8: Hostel
  { id: 'hostel_view', module: 'Hostel', action: 'view', code: 'hostel_view', name: 'View Hostel', description: 'View hostels blocks and rooms' },
  { id: 'hostel_manage', module: 'Hostel', action: 'manage', code: 'hostel_manage', name: 'Manage Hostel', description: 'Create hostel blocks and rooms' },
  { id: 'hostel_allocation_view', module: 'Hostel', action: 'view', code: 'hostel_allocation_view', name: 'View Hostel Allocations', description: 'View student hostel allocations' },
  { id: 'hostel_allocation_manage', module: 'Hostel', action: 'manage', code: 'hostel_allocation_manage', name: 'Manage Hostel Allocations', description: 'Allocate and vacate hostel beds' },
  { id: 'hostel_attendance_mark', module: 'Hostel', action: 'mark', code: 'hostel_attendance_mark', name: 'Mark Hostel Attendance', description: 'Mark daily hostel attendance' },
  // Phase 8: Inventory
  { id: 'inventory_view', module: 'Inventory', action: 'view', code: 'inventory_view', name: 'View Inventory', description: 'View inventory items and categories' },
  { id: 'inventory_manage', module: 'Inventory', action: 'manage', code: 'inventory_manage', name: 'Manage Inventory', description: 'Manage inventory items and categories' },
  { id: 'warehouse_view', module: 'Inventory', action: 'view', code: 'warehouse_view', name: 'View Warehouses', description: 'View warehouse locations' },
  { id: 'warehouse_manage', module: 'Inventory', action: 'manage', code: 'warehouse_manage', name: 'Manage Warehouses', description: 'Create and manage warehouses' },
  { id: 'stock_view', module: 'Inventory', action: 'view', code: 'stock_view', name: 'View Stock', description: 'View current stock levels' },
  { id: 'stock_adjust', module: 'Inventory', action: 'adjust', code: 'stock_adjust', name: 'Adjust Stock', description: 'Perform stock adjustments and movements' },
  { id: 'vendor_view', module: 'Inventory', action: 'view', code: 'vendor_view', name: 'View Vendors', description: 'View vendor directory' },
  { id: 'vendor_manage', module: 'Inventory', action: 'manage', code: 'vendor_manage', name: 'Manage Vendors', description: 'Create and manage vendors' },
  { id: 'purchase_request_view', module: 'Procurement', action: 'view', code: 'purchase_request_view', name: 'View Purchase Requests', description: 'View purchase requisitions' },
  { id: 'purchase_request_create', module: 'Procurement', action: 'create', code: 'purchase_request_create', name: 'Create Purchase Request', description: 'Submit purchase requisitions' },
  { id: 'purchase_request_approve', module: 'Procurement', action: 'approve', code: 'purchase_request_approve', name: 'Approve Purchase Request', description: 'Approve purchase requisitions' },
  { id: 'purchase_order_view', module: 'Procurement', action: 'view', code: 'purchase_order_view', name: 'View Purchase Orders', description: 'View purchase orders' },
  { id: 'purchase_order_create', module: 'Procurement', action: 'create', code: 'purchase_order_create', name: 'Create Purchase Order', description: 'Create purchase orders' },
  { id: 'goods_receipt_create', module: 'Procurement', action: 'create', code: 'goods_receipt_create', name: 'Receive Goods', description: 'Create goods receipt notes and update stock' },
  // Phase 8: Assets
  { id: 'asset_view', module: 'Assets', action: 'view', code: 'asset_view', name: 'View Assets', description: 'View asset register' },
  { id: 'asset_manage', module: 'Assets', action: 'manage', code: 'asset_manage', name: 'Manage Assets', description: 'Create and update assets' },
  { id: 'asset_assign', module: 'Assets', action: 'assign', code: 'asset_assign', name: 'Assign Assets', description: 'Assign assets to staff or departments' },
  { id: 'asset_maintenance', module: 'Assets', action: 'maintenance', code: 'asset_maintenance', name: 'Schedule Maintenance', description: 'Schedule asset maintenance' },
  { id: 'asset_dispose', module: 'Assets', action: 'dispose', code: 'asset_dispose', name: 'Dispose Assets', description: 'Write off or sell disposed assets' },
  // Phase 8: Visitors
  { id: 'visitor_view', module: 'Visitors', action: 'view', code: 'visitor_view', name: 'View Visitors', description: 'View visitor log and appointments' },
  { id: 'visitor_checkin', module: 'Visitors', action: 'checkin', code: 'visitor_checkin', name: 'Check-in Visitor', description: 'Register visitor check-in and check-out' },
  { id: 'visitor_manage', module: 'Visitors', action: 'manage', code: 'visitor_manage', name: 'Manage Visitors', description: 'Create and manage visitor appointments' },
  { id: 'gate_pass_view', module: 'Visitors', action: 'view', code: 'gate_pass_view', name: 'View Gate Passes', description: 'View issued gate passes' },
  { id: 'gate_pass_create', module: 'Visitors', action: 'create', code: 'gate_pass_create', name: 'Create Gate Pass', description: 'Issue gate passes' },
  { id: 'gate_pass_use', module: 'Visitors', action: 'use', code: 'gate_pass_use', name: 'Use Gate Pass', description: 'Validate and use a gate pass' },
  // Phase 9: SaaS Platform
  { id: 'subscription_view', module: 'SaaS', action: 'view', code: 'subscription_view', name: 'View Subscription', description: 'View school subscription and usage' },
  { id: 'subscription_manage', module: 'SaaS', action: 'manage', code: 'subscription_manage', name: 'Manage Subscription', description: 'Activate cancel or change subscription' },
  { id: 'plan_manage', module: 'SaaS', action: 'manage', code: 'plan_manage', name: 'Manage Plans', description: 'Create and manage subscription plans' },
  { id: 'platform_admin', module: 'SaaS', action: 'admin', code: 'platform_admin', name: 'Platform Admin', description: 'Full platform administration' },
  { id: 'api_key_view', module: 'SaaS', action: 'view', code: 'api_key_view', name: 'View API Keys', description: 'View API key list' },
  { id: 'api_key_manage', module: 'SaaS', action: 'manage', code: 'api_key_manage', name: 'Manage API Keys', description: 'Create and revoke API keys' },
  { id: 'webhook_view', module: 'SaaS', action: 'view', code: 'webhook_view', name: 'View Webhooks', description: 'View webhook configurations' },
  { id: 'webhook_manage', module: 'SaaS', action: 'manage', code: 'webhook_manage', name: 'Manage Webhooks', description: 'Create edit delete and test webhooks' },

  // Phase 10: Mobile, PWA & Offline Sync
  { id: 'mobile_app_view', module: 'Mobile & PWA', action: 'view', code: 'mobile_app_view', name: 'Access Mobile App', description: 'Access mobile PWA interface and offline cache' },
  { id: 'mobile_sync_view', module: 'Mobile & PWA', action: 'view', code: 'mobile_sync_view', name: 'View Mobile Sync', description: 'View synchronization queue and device state' },
  { id: 'mobile_sync_manage', module: 'Mobile & PWA', action: 'manage', code: 'mobile_sync_manage', name: 'Manage Mobile Sync', description: 'Resolve sync conflicts and manage mutations' },
  { id: 'mobile_device_manage', module: 'Mobile & PWA', action: 'manage', code: 'mobile_device_manage', name: 'Manage Devices', description: 'Register, inspect and revoke registered devices' },

  // Legacy action aliases
  { id: 'teacher_view', module: 'People & Staff', action: 'view', code: 'teacher_view', name: 'View Teachers (Legacy)', description: 'Alias for staff_view' },
  { id: 'teacher_create', module: 'People & Staff', action: 'create', code: 'teacher_create', name: 'Create Teacher (Legacy)', description: 'Alias for staff_manage' },
  { id: 'teacher_edit', module: 'People & Staff', action: 'edit', code: 'teacher_edit', name: 'Edit Teacher (Legacy)', description: 'Alias for staff_manage' },
  { id: 'teacher_delete', module: 'People & Staff', action: 'delete', code: 'teacher_delete', name: 'Delete Teacher (Legacy)', description: 'Alias for staff_manage' },
  { id: 'role_create', module: 'Roles & Access Control', action: 'create', code: 'role_create', name: 'Create Role (Legacy)', description: 'Alias for role_manage' },
  { id: 'role_edit', module: 'Roles & Access Control', action: 'edit', code: 'role_edit', name: 'Edit Role (Legacy)', description: 'Alias for role_manage' },
  { id: 'role_delete', module: 'Roles & Access Control', action: 'delete', code: 'role_delete', name: 'Delete Role (Legacy)', description: 'Alias for role_manage' },
  { id: 'role_activate', module: 'Roles & Access Control', action: 'activate', code: 'role_activate', name: 'Activate Role (Legacy)', description: 'Alias for role_manage' },
];

// 2. Extended Diverse Roles List across Hierarchy Levels 1 to 5
const rolesData = [
  {
    name: 'Super Administrator',
    code: 'SUPER_ADMIN',
    description: 'System Super Admin with complete administrative control and security governance',
    hierarchyLevel: 1,
    isSystem: true,
    status: 'ACTIVE',
  },
  {
    name: 'Executive Principal',
    code: 'PRINCIPAL',
    description: 'School Principal leading overall academic & institutional administration',
    hierarchyLevel: 1,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Vice Principal',
    code: 'VICE_PRINCIPAL',
    description: 'Vice Principal assisting in daily campus operation and academic supervision',
    hierarchyLevel: 1,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Academic Director',
    code: 'ACADEMIC_DIRECTOR',
    description: 'Director overseeing curriculum standards, examinations and teaching quality',
    hierarchyLevel: 2,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'IT System Administrator',
    code: 'IT_ADMIN',
    description: 'Technology administrator managing digital platforms, users and system security',
    hierarchyLevel: 2,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Head of Department (HOD)',
    code: 'HOD',
    description: 'Department Head leading subject faculty members and academic planning',
    hierarchyLevel: 3,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Finance & Accounts Manager',
    code: 'ACCOUNTANT',
    description: 'Financial manager handling fee collections, payroll, budgeting and accounts',
    hierarchyLevel: 3,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Human Resources Manager',
    code: 'HR_MANAGER',
    description: 'HR Lead managing staff recruitment, performance, attendance and personnel',
    hierarchyLevel: 3,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Senior Educator / Teacher',
    code: 'SENIOR_TEACHER',
    description: 'Senior teaching faculty providing classroom instruction and mentoring',
    hierarchyLevel: 4,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Class Teacher / Educator',
    code: 'TEACHER',
    description: 'Academic Educator managing assigned class sections, subjects and grades',
    hierarchyLevel: 4,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Assistant Teacher',
    code: 'JUNIOR_TEACHER',
    description: 'Junior educator supporting classroom instruction and student activities',
    hierarchyLevel: 4,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Sports & Athletics Coach',
    code: 'SPORTS_COACH',
    description: 'Physical Education instructor leading sports teams and fitness activities',
    hierarchyLevel: 4,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Administrative Staff',
    code: 'STAFF',
    description: 'School Operational Staff managing general campus administration and records',
    hierarchyLevel: 5,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Transport & Logistics Manager',
    code: 'TRANSPORT_MGR',
    description: 'Logistics coordinator managing school buses, routes and student transit',
    hierarchyLevel: 5,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Chief Librarian',
    code: 'LIBRARIAN',
    description: 'Librarian managing library catalogue, book circulation and digital learning',
    hierarchyLevel: 5,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Laboratory Assistant',
    code: 'LAB_ASSISTANT',
    description: 'Science & Computer Lab Assistant maintaining equipment and practical labs',
    hierarchyLevel: 5,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Front Office Receptionist',
    code: 'RECEPTIONIST',
    description: 'Receptionist managing visitor entries, helpline calls and general enquiries',
    hierarchyLevel: 5,
    isSystem: false,
    status: 'ACTIVE',
  },
];

// Realistic Staff & Faculty Data
const staffMembersData = [
  { firstName: 'Dr. Robert', lastName: 'Sterling', employeeId: 'EMP-1001', designation: 'Executive Principal', department: 'Leadership', experienceYears: 18, qualification: 'Ph.D in Education Administration', isTeaching: false },
  { firstName: 'Eleanor', lastName: 'Vance', employeeId: 'EMP-1002', designation: 'Vice Principal', department: 'Leadership', experienceYears: 14, qualification: 'M.Ed in Educational Leadership', isTeaching: false },
  { firstName: 'Marcus', lastName: 'Brody', employeeId: 'EMP-1003', designation: 'Academic Director', department: 'Academics', experienceYears: 15, qualification: 'M.Sc Physics, M.Ed', isTeaching: true },
  { firstName: 'Sarah', lastName: 'Connor', employeeId: 'EMP-1004', designation: 'Head of Mathematics', department: 'Mathematics', experienceYears: 12, qualification: 'M.Sc Mathematics', isTeaching: true },
  { firstName: 'Arthur', lastName: 'Pendelton', employeeId: 'EMP-1005', designation: 'Head of Science', department: 'Science', experienceYears: 11, qualification: 'M.Sc Chemistry', isTeaching: true },
  { firstName: 'David', lastName: 'Miller', employeeId: 'EMP-1006', designation: 'Senior Physics Teacher', department: 'Science', experienceYears: 9, qualification: 'M.Sc Physics, B.Ed', isTeaching: true },
  { firstName: 'Clara', lastName: 'Oswald', employeeId: 'EMP-1007', designation: 'English Literature Educator', department: 'Languages', experienceYears: 7, qualification: 'M.A English Literature, B.Ed', isTeaching: true },
  { firstName: 'Alan', lastName: 'Turing', employeeId: 'EMP-1008', designation: 'Computer Science Faculty', department: 'Computer Science', experienceYears: 8, qualification: 'M.Tech Computer Science', isTeaching: true },
  { firstName: 'Maria', lastName: 'Garcia', employeeId: 'EMP-1009', designation: 'Biology Teacher', department: 'Science', experienceYears: 6, qualification: 'M.Sc Botany, B.Ed', isTeaching: true },
  { firstName: 'James', lastName: 'Wilson', employeeId: 'EMP-1010', designation: 'History & Social Studies Educator', department: 'Social Sciences', experienceYears: 10, qualification: 'M.A History', isTeaching: true },
  { firstName: 'Rachel', lastName: 'Green', employeeId: 'EMP-1011', designation: 'Art & Design Instructor', department: 'Arts', experienceYears: 5, qualification: 'BFA Fine Arts', isTeaching: true },
  { firstName: 'Michael', lastName: 'Scott', employeeId: 'EMP-1012', designation: 'Finance & Accounts Manager', department: 'Finance', experienceYears: 13, qualification: 'MBA Finance, CA', isTeaching: false },
  { firstName: 'Pamela', lastName: 'Beesly', employeeId: 'EMP-1013', designation: 'Human Resources Officer', department: 'Human Resources', experienceYears: 6, qualification: 'MBA HR', isTeaching: false },
  { firstName: 'Dwight', lastName: 'Schrute', employeeId: 'EMP-1014', designation: 'Transport & Security Manager', department: 'Operations', experienceYears: 9, qualification: 'B.Com', isTeaching: false },
  { firstName: 'Giles', lastName: 'Rupert', employeeId: 'EMP-1015', designation: 'Chief Librarian', department: 'Library', experienceYears: 11, qualification: 'M.Lib Library Science', isTeaching: false },
  { firstName: 'Jonathan', lastName: 'Harker', employeeId: 'EMP-1016', designation: 'Geography Faculty Teacher', department: 'Social Sciences', experienceYears: 8, qualification: 'M.Sc Geography, B.Ed', isTeaching: true },
];

async function seed() {
  try {
    console.log('🌱 Starting Comprehensive MongoDB Database Reset & Seeding (Database: School_Management)...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('✅ Connected to MongoDB School_Management Database.');

    // Step 0: Clear ALL Existing Collections to guarantee clean interconnected data
    console.log('🧹 Purging all existing collection records...');
    await Promise.all([
      Permission.deleteMany({}),
      Role.deleteMany({}),
      School.deleteMany({}),
      Campus.deleteMany({}),
      AcademicYear.deleteMany({}),
      AcademicTerm.deleteMany({}),
      Grade.deleteMany({}),
      Section.deleteMany({}),
      Subject.deleteMany({}),
      ClassSubject.deleteMany({}),
      Staff.deleteMany({}),
      User.deleteMany({}),
      TeacherAssignment.deleteMany({}),
      Setting.deleteMany({}),
      AuditLog.deleteMany({}),
      Period.deleteMany({}),
      Timetable.deleteMany({}),
      AttendanceStatus.deleteMany({}),
      AttendanceSession.deleteMany({}),
      AttendanceRecord.deleteMany({}),
      AttendanceAudit.deleteMany({}),
      LeaveRequest.deleteMany({}),
    ]);
    console.log('✨ All existing collections purged cleanly.');

    // 1. Seed Permissions
    const permCodes = [];
    for (const p of permissionsData) {
      await Permission.create(p);
      permCodes.push(p.code);
    }
    console.log(`✅ ${permissionsData.length} Action Permissions seeded.`);

    // 2. Seed Roles
    const roleDocs = {};
    for (const r of rolesData) {
      const isSuper = r.code === 'SUPER_ADMIN';
      const rolePerms = isSuper
        ? permCodes
        : r.code === 'PRINCIPAL' || r.code === 'VICE_PRINCIPAL'
        ? permCodes.filter((c) => !c.includes('settings'))
        : r.code.includes('TEACHER') || r.code === 'HOD'
        ? ['staff_view', 'teacher_view', 'grade_view', 'section_view', 'subject_view', 'class_subject_view', 'teacher_assignment_view', 'mobile_app_view', 'mobile_sync_view']
        : ['staff_view', 'teacher_view', 'school_view', 'campus_view', 'grade_view', 'section_view', 'mobile_app_view'];

      const role = await Role.create({ ...r, permissions: rolePerms });
      roleDocs[r.code] = role;
    }
    console.log(`✅ ${rolesData.length} System Roles seeded across Hierarchy Levels 1 to 5.`);

    // 3. Seed School & Campuses
    const school = await School.create({
      name: 'St. Mary Enterprise Academy',
      code: 'SCH-001',
      address: '100 Knowledge Boulevard, Tech City Campus',
      phone: '+91 98765 43210',
      email: 'contact@stmarys.edu',
      website: 'https://stmarys.edu',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const campusesData = [
      { name: 'Main City Campus', code: 'MAIN', address: '100 Knowledge Boulevard', isMain: true },
      { name: 'North Science Wing Campus', code: 'NORTH', address: '45 Innovation Drive, North District', isMain: false },
      { name: 'West Sports & Athletics Complex', code: 'WEST', address: '88 Sports Avenue, West Avenue', isMain: false },
      { name: 'East Junior Primary Wing', code: 'EAST', address: '12 Garden Street, East Suburb', isMain: false },
    ];

    const campusDocs = [];
    for (const c of campusesData) {
      const camp = await Campus.create({ schoolId: school._id, ...c, status: 'ACTIVE' });
      campusDocs.push(camp);
    }
    console.log(`✅ School & ${campusesData.length} Campuses seeded.`);

    // 4. Seed Academic Years & Terms
    const ayData = [
      { name: '2024 - 2025', code: 'AY2024-25', startDate: new Date('2024-06-01'), endDate: new Date('2025-04-30'), isCurrent: false },
      { name: '2025 - 2026', code: 'AY2025-26', startDate: new Date('2025-06-01'), endDate: new Date('2026-04-30'), isCurrent: true },
      { name: '2026 - 2027', code: 'AY2026-27', startDate: new Date('2026-06-01'), endDate: new Date('2027-04-30'), isCurrent: false },
    ];

    const ayDocs = [];
    for (const ay of ayData) {
      const doc = await AcademicYear.create({ schoolId: school._id, ...ay, status: 'ACTIVE' });
      ayDocs.push(doc);
    }

    const currentAY = ayDocs.find((a) => a.isCurrent) || ayDocs[0];

    const termsData = [
      { name: 'Term 1 - Fall Semester', code: 'TERM-1', sequence: 1, startDate: new Date('2025-06-01'), endDate: new Date('2025-09-30'), isCurrent: false },
      { name: 'Term 2 - Winter Semester', code: 'TERM-2', sequence: 2, startDate: new Date('2025-10-01'), endDate: new Date('2026-01-31'), isCurrent: true },
      { name: 'Term 3 - Spring Semester', code: 'TERM-3', sequence: 3, startDate: new Date('2026-02-01'), endDate: new Date('2026-04-30'), isCurrent: false },
    ];

    for (const t of termsData) {
      await AcademicTerm.create({ schoolId: school._id, academicYearId: currentAY._id, ...t, status: 'ACTIVE' });
    }
    console.log(`✅ ${ayData.length} Academic Years & ${termsData.length} Academic Terms seeded.`);

    // 5. Seed Grades & Class Sections
    const gradesData = [
      { name: 'Nursery / Pre-K', code: 'NURSERY', category: 'Pre-Primary', sequenceOrder: 1 },
      { name: 'Kindergarten (KG)', code: 'KG', category: 'Pre-Primary', sequenceOrder: 2 },
      { name: 'Grade 1', code: 'GRADE_1', category: 'Primary', sequenceOrder: 3 },
      { name: 'Grade 2', code: 'GRADE_2', category: 'Primary', sequenceOrder: 4 },
      { name: 'Grade 3', code: 'GRADE_3', category: 'Primary', sequenceOrder: 5 },
      { name: 'Grade 4', code: 'GRADE_4', category: 'Primary', sequenceOrder: 6 },
      { name: 'Grade 5', code: 'GRADE_5', category: 'Primary', sequenceOrder: 7 },
      { name: 'Grade 6', code: 'GRADE_6', category: 'Secondary', sequenceOrder: 8 },
      { name: 'Grade 7', code: 'GRADE_7', category: 'Secondary', sequenceOrder: 9 },
      { name: 'Grade 8', code: 'GRADE_8', category: 'Secondary', sequenceOrder: 10 },
      { name: 'Grade 9', code: 'GRADE_9', category: 'High School', sequenceOrder: 11 },
      { name: 'Grade 10', code: 'GRADE_10', category: 'High School', sequenceOrder: 12 },
      { name: 'Grade 11 - Science / Arts', code: 'GRADE_11', category: 'Senior Secondary', sequenceOrder: 13 },
      { name: 'Grade 12 - Senior Graduation', code: 'GRADE_12', category: 'Senior Secondary', sequenceOrder: 14 },
    ];

    const gradeDocs = [];
    for (const g of gradesData) {
      const doc = await Grade.create({ schoolId: school._id, ...g, status: 'ACTIVE' });
      gradeDocs.push(doc);
    }

    const sectionsList = ['Section A', 'Section B', 'Section C', 'Section D'];
    const sectionDocs = [];
    for (const gDoc of gradeDocs) {
      for (let i = 0; i < sectionsList.length; i++) {
        const secCode = `SEC_${gDoc.code}_${String.fromCharCode(65 + i)}`;
        const sec = await Section.create({
          schoolId: school._id,
          gradeId: gDoc._id,
          name: sectionsList[i],
          code: secCode,
          capacity: 40,
          room: `Room ${100 + gDoc.sequenceOrder * 10 + i}`,
          status: 'ACTIVE',
        });
        sectionDocs.push(sec);
      }
    }
    console.log(`✅ ${gradesData.length} Grades & ${sectionDocs.length} Class Sections seeded.`);

    // 6. Seed Master Subjects & Class Subject Mappings
    const subjectsData = [
      { name: 'Mathematics', code: 'MATH', shortName: 'Math', type: 'CORE', description: 'Elementary & Advanced Mathematics' },
      { name: 'Physics Science', code: 'PHYSICS', shortName: 'Phy', type: 'LAB', description: 'Theoretical & Practical Physics' },
      { name: 'Chemistry Science', code: 'CHEM', shortName: 'Chem', type: 'LAB', description: 'Inorganic & Organic Chemistry' },
      { name: 'Biology & Life Science', code: 'BIO', shortName: 'Bio', type: 'LAB', description: 'Botany, Zoology & Human Biology' },
      { name: 'English Literature & Language', code: 'ENG', shortName: 'Eng', type: 'CORE', description: 'Grammar, Writing & World Literature' },
      { name: 'Computer Science & ICT', code: 'CS', shortName: 'CS', type: 'LAB', description: 'Programming, Algorithms & Digital Literacy' },
      { name: 'World History & Civilizations', code: 'HIST', shortName: 'Hist', type: 'CORE', description: 'Ancient & Modern World History' },
      { name: 'Geography & Environmental Science', code: 'GEO', shortName: 'Geo', type: 'CORE', description: 'Physical & Human Geography' },
      { name: 'Physical Education & Athletics', code: 'PE', shortName: 'PE', type: 'ACTIVITY', description: 'Fitness, Sports & Team Games' },
      { name: 'Art, Craft & Design', code: 'ART', shortName: 'Art', type: 'ACTIVITY', description: 'Visual Arts & Creative Design' },
    ];

    const subjectDocs = [];
    for (const sub of subjectsData) {
      const doc = await Subject.create({ schoolId: school._id, ...sub, status: 'ACTIVE' });
      subjectDocs.push(doc);
    }

    let classSubCount = 0;
    for (const gDoc of gradeDocs.slice(2)) {
      for (const sDoc of subjectDocs) {
        await ClassSubject.create({
          schoolId: school._id,
          academicYearId: currentAY._id,
          gradeId: gDoc._id,
          subjectId: sDoc._id,
          isMandatory: true,
          weeklyPeriods: 5,
          passMarks: 35,
          maxMarks: 100,
          status: 'ACTIVE',
        });
        classSubCount++;
      }
    }
    console.log(`✅ ${subjectsData.length} Master Subjects & ${classSubCount} Class Subject Mappings seeded.`);

    // 7. Seed Staff Directory & User Login Accounts
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const staffDocs = [];

    // Super Admin User
    const adminUser = await User.create({
      schoolId: school._id,
      roleId: roleDocs['SUPER_ADMIN']._id,
      email: 'admin@schoolerp.com',
      password: hashedPassword,
      name: 'System Administrator',
      phone: '+91 98765 43210',
      status: 'ACTIVE',
    });

    await Staff.create({
      schoolId: school._id,
      userId: adminUser._id,
      employeeId: 'EMP-1000',
      firstName: 'System',
      lastName: 'Administrator',
      email: 'admin@schoolerp.com',
      phone: '+91 98765 43210',
      designation: 'Chief Technology Administrator',
      department: 'IT & Systems',
      experienceYears: 15,
      qualification: 'M.Tech IT Governance',
      isTeachingStaff: false,
      status: 'ACTIVE',
    });

    for (let idx = 0; idx < staffMembersData.length; idx++) {
      const sData = staffMembersData[idx];
      const email = `${sData.firstName.toLowerCase().replace(/[^a-z]/g, '')}.${sData.lastName.toLowerCase().replace(/[^a-z]/g, '')}@schoolerp.com`;
      const roleCode = idx === 0 ? 'PRINCIPAL' : idx === 1 ? 'VICE_PRINCIPAL' : idx === 2 ? 'ACADEMIC_DIRECTOR' : idx < 5 ? 'HOD' : idx < 11 ? 'TEACHER' : idx === 11 ? 'ACCOUNTANT' : idx === 12 ? 'HR_MANAGER' : idx === 13 ? 'TRANSPORT_MGR' : idx === 14 ? 'LIBRARIAN' : 'TEACHER';

      const user = await User.create({
        schoolId: school._id,
        roleId: roleDocs[roleCode]._id,
        email,
        password: hashedPassword,
        name: `${sData.firstName} ${sData.lastName}`,
        phone: `+91 98765 ${40000 + idx}`,
        status: 'ACTIVE',
      });

      const stDoc = await Staff.create({
        schoolId: school._id,
        userId: user._id,
        employeeId: sData.employeeId,
        firstName: sData.firstName,
        lastName: sData.lastName,
        email,
        phone: `+91 98765 ${40000 + idx}`,
        designation: sData.designation,
        department: sData.department,
        experienceYears: sData.experienceYears,
        qualification: sData.qualification,
        isTeachingStaff: sData.isTeaching,
        status: 'ACTIVE',
      });
      staffDocs.push({ ...stDoc.toObject(), user });
    }
    console.log(`✅ ${staffMembersData.length + 1} Staff Profiles & User Accounts seeded (Password: admin123).`);

    // 8. Seed Realistic Teacher Assignments
    const teachingStaff = staffDocs.filter((s) => s.isTeachingStaff);
    let assignCount = 0;
    if (teachingStaff.length > 0 && gradeDocs.length > 2 && subjectDocs.length > 0) {
      for (let gIdx = 2; gIdx < Math.min(10, gradeDocs.length); gIdx++) {
        const grade = gradeDocs[gIdx];
        const gradeSections = sectionDocs.filter((sec) => String(sec.gradeId) === String(grade._id));
        for (const sec of gradeSections) {
          for (let sIdx = 0; sIdx < Math.min(4, subjectDocs.length); sIdx++) {
            const subject = subjectDocs[sIdx];
            const teacher = teachingStaff[(gIdx + sIdx + assignCount) % teachingStaff.length];
            await TeacherAssignment.create({
              schoolId: school._id,
              academicYearId: currentAY._id,
              staffId: teacher._id,
              gradeId: grade._id,
              sectionId: sec._id,
              subjectId: subject._id,
              isClassTeacher: sIdx === 0,
              status: 'ACTIVE',
            });
            assignCount++;
          }
        }
      }
    }
    console.log(`✅ ${assignCount} Teacher Assignments interconnected across staff, grades, sections & subjects.`);

    // 9. Seed Realistic Students, Guardians, Admissions & Enrollments
    const firstNames = ['Aarav', 'Ananya', 'Rohan', 'Diya', 'Vivaan', 'Isha', 'Aditya', 'Sanya', 'Kabir', 'Tara', 'Arjun', 'Meera', 'Dev', 'Kavya', 'Reyansh', 'Anushka', 'Ishaan', 'Riya', 'Vihaan', 'Pari', 'Siddharth', 'Prisha', 'Karan', 'Aditi', 'Rahul'];
    const lastNames = ['Sharma', 'Verma', 'Gupta', 'Patel', 'Reddy', 'Chawla', 'Mehta', 'Joshi', 'Nair', 'Singh', 'Kapoor', 'Rao', 'Bhat', 'Saxena', 'Deshmukh'];
    const guardianNames = ['Rajesh', 'Suresh', 'Anita', 'Sunita', 'Vikram', 'Pooja', 'Ramesh', 'Kavita', 'Sanjay', 'Geeta'];

    const studentDocs = [];
    const guardianDocs = [];
    let studentCount = 0;

    for (let i = 0; i < 25; i++) {
      const fName = firstNames[i % firstNames.length];
      const lName = lastNames[i % lastNames.length];
      const gName = guardianNames[i % guardianNames.length] + ' ' + lName;
      const stuNum = `STU-2026-${String(i + 1).padStart(5, '0')}`;
      const admNum = `ADM-2026-${String(i + 1).padStart(5, '0')}`;
      const birthYear = 2012 + (i % 6);

      // Create Student
      const student = await Student.create({
        schoolId: school._id,
        studentNumber: stuNum,
        admissionNumber: admNum,
        firstName: fName,
        middleName: 'Kumar',
        lastName: lName,
        dob: new Date(`${birthYear}-05-${(i % 25) + 1}`),
        gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
        bloodGroup: ['A+', 'B+', 'O+', 'AB+'][i % 4],
        nationality: 'Indian',
        email: `${fName.toLowerCase()}.${lName.toLowerCase()}@student.schoolerp.com`,
        phone: `+91 98765 ${10000 + i}`,
        address: {
          street: `${i + 101} High Street`,
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'India',
        },
        status: i < 20 ? 'ACTIVE' : i < 23 ? 'ADMITTED' : 'APPLICANT',
        admissionDate: new Date('2026-06-01'),
        previousSchool: 'St. Xavier Primary School',
        emergencyContact: {
          name: gName,
          relationship: 'FATHER',
          phone: `+91 98200 ${20000 + i}`,
        },
      });
      studentDocs.push(student);

      // Create Guardian
      let guardian = await Guardian.create({
        schoolId: school._id,
        name: gName,
        relationship: i % 2 === 0 ? 'FATHER' : 'MOTHER',
        phone: `+91 98200 ${20000 + i}`,
        email: `parent.${lName.toLowerCase()}${i}@gmail.com`,
        occupation: ['Software Engineer', 'Doctor', 'Business Owner', 'Architect', 'Professor'][i % 5],
        address: `${i + 101} High Street, Mumbai`,
        isPrimary: true,
        isEmergencyContact: true,
      });
      guardianDocs.push(guardian);

      // Link Student & Guardian
      await StudentGuardian.create({
        schoolId: school._id,
        studentId: student._id,
        guardianId: guardian._id,
        relationship: guardian.relationship,
        isPrimary: true,
        isEmergencyContact: true,
      });

      // Create Admission Application
      const gradeTarget = gradeDocs[i % gradeDocs.length];
      const admission = await Admission.create({
        schoolId: school._id,
        applicationNumber: admNum,
        applicationDate: new Date('2026-05-15'),
        academicYearId: currentAY._id,
        gradeId: gradeTarget._id,
        studentData: {
          firstName: fName,
          lastName: lName,
          dob: student.dob,
          gender: student.gender,
          email: student.email,
          phone: student.phone,
        },
        guardianData: [{ name: gName, relationship: guardian.relationship, phone: guardian.phone }],
        status: i < 20 ? 'ENROLLED' : i < 23 ? 'ADMITTED' : 'APPROVED',
        notes: 'Document verification completed and approved.',
        studentId: student._id,
      });

      // Enroll Active Students in Grade & Section
      if (i < 20) {
        const gradeSections = sectionDocs.filter((sec) => String(sec.gradeId) === String(gradeTarget._id));
        const assignedSection = gradeSections[i % (gradeSections.length || 1)] || sectionDocs[0];

        const enrollment = await Enrollment.create({
          schoolId: school._id,
          studentId: student._id,
          academicYearId: currentAY._id,
          gradeId: gradeTarget._id,
          sectionId: assignedSection._id,
          enrollmentDate: new Date('2026-06-01'),
          status: 'ACTIVE',
          isCurrent: true,
        });

        await AcademicHistory.create({
          schoolId: school._id,
          studentId: student._id,
          academicYearId: currentAY._id,
          gradeId: gradeTarget._id,
          sectionId: assignedSection._id,
          enrollmentId: enrollment._id,
          promotionStatus: 'ENROLLED',
          remarks: `Admitted & Enrolled into ${gradeTarget.name} - ${assignedSection.name}`,
        });

        // Seed Student Document
        await StudentDocument.create({
          schoolId: school._id,
          studentId: student._id,
          admissionId: admission._id,
          documentType: 'BIRTH_CERTIFICATE',
          title: 'Birth Certificate',
          fileName: `${fName}_BirthCert.pdf`,
          fileUrl: 'https://storage.schoolerp.com/docs/sample_birth_cert.pdf',
          fileSize: 1048576,
          mimeType: 'application/pdf',
          status: 'ACTIVE',
        });
      }
      studentCount++;
    }
    console.log(`✅ ${studentCount} Students, Guardians, Admissions & Enrollments interconnected.`);

    // 10. Seed System Settings
    const settingsList = [
      { category: 'GENERAL', key: 'INSTITUTION_NAME', value: 'St. Mary Enterprise Academy', description: 'Official institution display title' },
      { category: 'GENERAL', key: 'ACADEMIC_YEAR_CURRENT', value: 'AY2025-26', description: 'Active academic calendar year' },
      { category: 'SEQUENCE', key: 'STUDENT_COUNTER_2026', value: '25', description: 'Active student counter sequence' },
      { category: 'SEQUENCE', key: 'ADMISSION_COUNTER_2026', value: '25', description: 'Active admission counter sequence' },
      { category: 'SECURITY', key: 'PASSWORD_MIN_LENGTH', value: '8', description: 'Minimum password length constraint' },
      { category: 'SECURITY', key: 'MAX_LOGIN_ATTEMPTS', value: '5', description: 'Account lockout threshold' },
      { category: 'ATTENDANCE', key: 'MINIMUM_ATTENDANCE_PCT', value: '75', description: 'Minimum mandatory student attendance percentage' },
    ];

    for (const s of settingsList) {
      await Setting.create({ schoolId: school._id, ...s });
    }
    console.log(`✅ ${settingsList.length} System Settings seeded.`);

    // 11. Seed Realistic Audit Logs
    const auditEntries = [
      { action: 'LOGIN_SUCCESS', entity: 'User', entityId: adminUser._id.toString(), actorName: 'System Administrator', actorEmail: 'admin@schoolerp.com', reason: 'Admin portal login', ipAddress: '127.0.0.1' },
      { action: 'ROLE_CREATE', entity: 'Role', entityId: roleDocs['TEACHER']._id.toString(), actorName: 'System Administrator', actorEmail: 'admin@schoolerp.com', reason: 'Configured Class Teacher role', ipAddress: '127.0.0.1' },
      { action: 'TEACHER_ASSIGNMENT_CREATE', entity: 'TeacherAssignment', entityId: 'TA-1001', actorName: 'Dr. Robert Sterling', actorEmail: 'robert.sterling@schoolerp.com', reason: 'Assigned Mathematics teacher to Grade 10-A', ipAddress: '192.168.1.10' },
      { action: 'STUDENT_CREATE', entity: 'Student', entityId: studentDocs[0]._id.toString(), actorName: 'System Administrator', actorEmail: 'admin@schoolerp.com', reason: 'Created Student Master STU-2026-00001', ipAddress: '127.0.0.1' },
    ];

    for (const a of auditEntries) {
      await AuditLog.create({ schoolId: school._id, ...a });
    }
    console.log(`✅ ${auditEntries.length} Audit Trail Records seeded.`);

    // 12. Phase 3: Seed Periods & Bell Schedules
    const periodsList = [
      { name: 'Period 1', code: 'P1', sequence: 1, startTime: '08:30', endTime: '09:15', durationMinutes: 45, isBreak: false },
      { name: 'Period 2', code: 'P2', sequence: 2, startTime: '09:15', endTime: '10:00', durationMinutes: 45, isBreak: false },
      { name: 'Morning Recess', code: 'RECESS', sequence: 3, startTime: '10:00', endTime: '10:20', durationMinutes: 20, isBreak: true },
      { name: 'Period 3', code: 'P3', sequence: 4, startTime: '10:20', endTime: '11:05', durationMinutes: 45, isBreak: false },
      { name: 'Period 4', code: 'P4', sequence: 5, startTime: '11:05', endTime: '11:50', durationMinutes: 45, isBreak: false },
      { name: 'Lunch Break', code: 'LUNCH', sequence: 6, startTime: '11:50', endTime: '12:35', durationMinutes: 45, isBreak: true },
      { name: 'Period 5', code: 'P5', sequence: 7, startTime: '12:35', endTime: '13:20', durationMinutes: 45, isBreak: false },
      { name: 'Period 6', code: 'P6', sequence: 8, startTime: '13:20', endTime: '14:05', durationMinutes: 45, isBreak: false },
    ];

    const periodDocs = [];
    for (const p of periodsList) {
      const doc = await Period.create({ schoolId: school._id, ...p, status: 'ACTIVE' });
      periodDocs.push(doc);
    }
    console.log(`✅ ${periodDocs.length} Bell Schedule Periods seeded.`);

    // 13. Phase 3: Seed Master Attendance Statuses
    const attendanceStatusesList = [
      { name: 'Present', code: 'PRESENT', shortCode: 'P', countsAsPresent: true, countsAsAbsent: false, requiresReason: false, colorToken: 'emerald', sequence: 1 },
      { name: 'Absent', code: 'ABSENT', shortCode: 'A', countsAsPresent: false, countsAsAbsent: true, requiresReason: false, colorToken: 'rose', sequence: 2 },
      { name: 'Late Arrival', code: 'LATE', shortCode: 'L', countsAsPresent: true, countsAsAbsent: false, requiresReason: true, colorToken: 'amber', sequence: 3 },
      { name: 'Excused Absence', code: 'EXCUSED', shortCode: 'E', countsAsPresent: false, countsAsAbsent: false, requiresReason: true, colorToken: 'sky', sequence: 4 },
      { name: 'Approved Leave', code: 'LEAVE', shortCode: 'LV', countsAsPresent: false, countsAsAbsent: false, requiresReason: true, colorToken: 'indigo', sequence: 5 },
      { name: 'Half Day', code: 'HALF_DAY', shortCode: 'HD', countsAsPresent: true, countsAsAbsent: false, requiresReason: true, colorToken: 'purple', sequence: 6 },
    ];

    const statusDocs = {};
    for (const s of attendanceStatusesList) {
      const doc = await AttendanceStatus.create({ schoolId: school._id, ...s, status: 'ACTIVE' });
      statusDocs[s.code] = doc;
    }
    console.log(`✅ ${attendanceStatusesList.length} Master Attendance Statuses seeded.`);

    // 14. Phase 3: Seed Timetable Matrices
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    const nonBreakPeriods = periodDocs.filter((p) => !p.isBreak);
    let timetableCount = 0;

    if (teachingStaff.length > 0 && gradeDocs.length > 2) {
      for (let gIdx = 2; gIdx < Math.min(8, gradeDocs.length); gIdx++) {
        const grade = gradeDocs[gIdx];
        const gradeSections = sectionDocs.filter((sec) => String(sec.gradeId) === String(grade._id));
        for (const sec of gradeSections) {
          for (const day of days) {
            for (let pIdx = 0; pIdx < nonBreakPeriods.length; pIdx++) {
              const period = nonBreakPeriods[pIdx];
              const subject = subjectDocs[(gIdx + pIdx) % subjectDocs.length];
              const teacher = teachingStaff[(gIdx + pIdx + timetableCount) % teachingStaff.length];

              try {
                await Timetable.create({
                  schoolId: school._id,
                  academicYearId: currentAY._id,
                  campusId: campusDocs[0]._id,
                  gradeId: grade._id,
                  sectionId: sec._id,
                  dayOfWeek: day,
                  periodId: period._id,
                  subjectId: subject._id,
                  teacherId: teacher._id,
                  roomNumber: sec.room || 'Room 101',
                  status: 'ACTIVE',
                });
                timetableCount++;
              } catch (e) {
                // Ignore unique constraint collisions during test matrix generation
              }
            }
          }
        }
      }
    }
    console.log(`✅ ${timetableCount} Conflict-Free Timetable Entries seeded.`);

    // 15. Phase 3: Seed Sample Daily Attendance Session & Student Records
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetSection = sectionDocs[0];
    const targetGrade = gradeDocs.find((g) => String(g._id) === String(targetSection.gradeId)) || gradeDocs[2];
    const sectionEnrollments = await Enrollment.find({ schoolId: school._id, sectionId: targetSection._id, isCurrent: true });

    if (sectionEnrollments.length > 0) {
      const session = await AttendanceSession.create({
        schoolId: school._id,
        academicYearId: currentAY._id,
        date: today,
        gradeId: targetGrade._id,
        sectionId: targetSection._id,
        attendanceType: 'DAILY',
        status: 'SUBMITTED',
        startedAt: new Date(),
        completedAt: new Date(),
        markedBy: adminUser._id,
      });

      for (let i = 0; i < sectionEnrollments.length; i++) {
        const enr = sectionEnrollments[i];
        const statusCode = i % 7 === 0 ? 'ABSENT' : i % 5 === 0 ? 'LATE' : 'PRESENT';
        await AttendanceRecord.create({
          schoolId: school._id,
          attendanceSessionId: session._id,
          academicYearId: currentAY._id,
          studentId: enr.studentId,
          enrollmentId: enr._id,
          gradeId: targetGrade._id,
          sectionId: targetSection._id,
          date: today,
          statusId: statusDocs[statusCode]._id,
          markedBy: adminUser._id,
          markedAt: new Date(),
          remarks: statusCode === 'LATE' ? 'Arrived at 08:45 AM' : '',
          source: 'BULK',
        });
      }
      console.log(`✅ Daily Attendance Session & ${sectionEnrollments.length} Records seeded for today.`);
    }

    // 16. Phase 3: Seed Student Leave Requests
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 3);

    if (studentDocs.length > 0) {
      await LeaveRequest.create({
        schoolId: school._id,
        studentId: studentDocs[0]._id,
        academicYearId: currentAY._id,
        fromDate: tomorrow,
        toDate: dayAfter,
        reason: 'Family wedding event',
        requestedBy: 'FATHER',
        status: 'PENDING',
      });

      await LeaveRequest.create({
        schoolId: school._id,
        studentId: studentDocs[1]._id,
        academicYearId: currentAY._id,
        fromDate: new Date('2026-06-10'),
        toDate: new Date('2026-06-12'),
        reason: 'Fever and doctor recommended rest',
        requestedBy: 'MOTHER',
        status: 'APPROVED',
        approvedBy: adminUser._id,
        approvedAt: new Date(),
        remarks: 'Medical certificate verified',
      });
      console.log('✅ Student Leave Requests seeded.');
    }

    // 17. Phase 5: Seed Fee Categories, Structures, Assignments, Invoices, Payments, Receipts & Append-only Ledger
    console.log('🌱 Seeding Phase 5 Financial Engine...');

    const feeCatTuition = await FeeCategory.create({
      schoolId: school._id,
      name: 'Tuition Fee',
      code: 'TUITION',
      description: 'Monthly academic tuition fee',
      categoryType: 'TUITION',
      sequence: 1,
      status: 'ACTIVE',
      createdBy: adminUser._id
    });

    const feeCatTransport = await FeeCategory.create({
      schoolId: school._id,
      name: 'Transport Fee',
      code: 'TRANSPORT',
      description: 'Monthly bus pick & drop service',
      categoryType: 'TRANSPORT',
      sequence: 2,
      status: 'ACTIVE',
      createdBy: adminUser._id
    });

    const feeCatExam = await FeeCategory.create({
      schoolId: school._id,
      name: 'Examination Fee',
      code: 'EXAM',
      description: 'Term exam & report card fee',
      categoryType: 'EXAM',
      sequence: 3,
      status: 'ACTIVE',
      createdBy: adminUser._id
    });

    const feeStructure = await FeeStructure.create({
      schoolId: school._id,
      academicYearId: currentAY._id,
      name: 'Grade 8 Standard Fee Structure',
      code: 'FS-G8-2026',
      description: 'Standard monthly billing for Grade 8',
      applicableTo: 'GRADE_LEVEL',
      gradeIds: [gradeDocs[2]?._id || gradeDocs[0]._id],
      effectiveFrom: new Date('2026-06-01'),
      billingFrequency: 'MONTHLY',
      status: 'ACTIVE',
      createdBy: adminUser._id
    });

    const feeItem1 = await FeeStructureItem.create({
      schoolId: school._id,
      feeStructureId: feeStructure._id,
      feeCategoryId: feeCatTuition._id,
      name: 'Tuition Fee',
      amount: 5000,
      frequency: 'MONTHLY',
      isMandatory: true,
      sequence: 1,
      fineEnabled: true,
      discountAllowed: true,
      concessionAllowed: true,
      status: 'ACTIVE'
    });

    const feeItem2 = await FeeStructureItem.create({
      schoolId: school._id,
      feeStructureId: feeStructure._id,
      feeCategoryId: feeCatTransport._id,
      name: 'Transport Fee',
      amount: 1500,
      frequency: 'MONTHLY',
      isMandatory: false,
      sequence: 2,
      fineEnabled: true,
      discountAllowed: true,
      concessionAllowed: true,
      status: 'ACTIVE'
    });

    // Seed Fine Rule
    await FeeFineRule.create({
      schoolId: school._id,
      name: 'Late Payment Fine',
      code: 'FINE-LATE-100',
      calculationType: 'FIXED',
      value: 100,
      graceDays: 5,
      maximumAmount: 500,
      applicableFeeCategoryIds: [feeCatTuition._id],
      status: 'ACTIVE'
    });

    // Seed Fee Assignments & Invoices for top 5 students
    for (let i = 0; i < Math.min(5, studentDocs.length); i++) {
      const student = studentDocs[i];
      const enrollment = await Enrollment.findOne({ schoolId: school._id, studentId: student._id, isCurrent: true });

      // Create Fee Assignment
      const assignment = await StudentFeeAssignment.create({
        schoolId: school._id,
        academicYearId: currentAY._id,
        studentId: student._id,
        enrollmentId: enrollment?._id,
        feeStructureId: feeStructure._id,
        assignedItems: [
          {
            feeCategoryId: feeCatTuition._id,
            feeStructureItemId: feeItem1._id,
            name: 'Tuition Fee',
            amount: 5000,
            frequency: 'MONTHLY',
            isMandatory: true,
            fineEnabled: true,
            discountAllowed: true,
            concessionAllowed: true
          },
          {
            feeCategoryId: feeCatTransport._id,
            feeStructureItemId: feeItem2._id,
            name: 'Transport Fee',
            amount: 1500,
            frequency: 'MONTHLY',
            isMandatory: false,
            fineEnabled: true,
            discountAllowed: true,
            concessionAllowed: true
          }
        ],
        effectiveFrom: new Date('2026-06-01'),
        status: 'ACTIVE',
        assignedBy: adminUser._id
      });

      // Seed Concession for student 0
      if (i === 0) {
        await FeeConcession.create({
          schoolId: school._id,
          studentId: student._id,
          academicYearId: currentAY._id,
          name: 'Sibling Concession 10%',
          code: 'CONC-SIB-10',
          type: 'PERCENTAGE',
          value: 10,
          applicableFeeCategoryIds: [feeCatTuition._id],
          reason: 'Younger sibling enrolled',
          status: 'APPROVED',
          createdBy: adminUser._id,
          approvedBy: adminUser._id
        });
      }

      // Generate sample Invoice for 2026-09
      const invNum = `INV-2026-0000${i + 1}`;
      const isPaid = i % 2 === 0;
      const isPartial = i === 1;

      const subtotal = 6500;
      const concAmt = (i === 0) ? 500 : 0;
      const totalAmt = subtotal - concAmt;
      const paidAmt = isPaid ? totalAmt : (isPartial ? 4000 : 0);
      const balAmt = totalAmt - paidAmt;
      const invStatus = isPaid ? 'PAID' : (isPartial ? 'PARTIALLY_PAID' : 'ISSUED');

      const invoice = await Invoice.create({
        schoolId: school._id,
        academicYearId: currentAY._id,
        studentId: student._id,
        enrollmentId: enrollment?._id,
        invoiceNumber: invNum,
        invoiceDate: new Date('2026-09-01'),
        dueDate: new Date('2026-09-15'),
        billingPeriod: '2026-09',
        subtotal,
        discountAmount: 0,
        concessionAmount: concAmt,
        fineAmount: 0,
        taxAmount: 0,
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        balanceAmount: balAmt,
        status: invStatus,
        createdBy: adminUser._id
      });

      await InvoiceItem.create({
        schoolId: school._id,
        invoiceId: invoice._id,
        feeCategoryId: feeCatTuition._id,
        feeStructureItemId: feeItem1._id,
        description: 'Tuition Fee',
        quantity: 1,
        unitAmount: 5000,
        grossAmount: 5000,
        discountAmount: 0,
        concessionAmount: concAmt,
        fineAmount: 0,
        netAmount: 5000 - concAmt,
        sequence: 1
      });

      await InvoiceItem.create({
        schoolId: school._id,
        invoiceId: invoice._id,
        feeCategoryId: feeCatTransport._id,
        feeStructureItemId: feeItem2._id,
        description: 'Transport Fee',
        quantity: 1,
        unitAmount: 1500,
        grossAmount: 1500,
        discountAmount: 0,
        concessionAmount: 0,
        fineAmount: 0,
        netAmount: 1500,
        sequence: 2
      });

      // Initial Student Ledger DEBIT entry for Invoice
      await StudentLedger.create({
        schoolId: school._id,
        academicYearId: currentAY._id,
        studentId: student._id,
        referenceType: 'INVOICE',
        referenceId: invoice._id,
        transactionType: 'DEBIT',
        debit: totalAmt,
        credit: 0,
        balance: totalAmt,
        description: `Fee Invoice ${invNum} for 2026-09`,
        transactionDate: new Date('2026-09-01'),
        createdBy: adminUser._id
      });

      // If payments made, seed Payment & Receipt & Ledger CREDIT entry
      if (paidAmt > 0) {
        const payNum = `PAY-2026-0000${i + 1}`;
        const payment = await Payment.create({
          schoolId: school._id,
          studentId: student._id,
          paymentNumber: payNum,
          paymentDate: new Date('2026-09-05'),
          amount: paidAmt,
          currency: 'INR',
          paymentMethod: i % 2 === 0 ? 'UPI' : 'CASH',
          referenceNumber: `REF-ONLINE-${Date.now().toString().slice(-6)}`,
          status: 'SUCCESS',
          receivedBy: adminUser._id,
          idempotencyKey: `IDEM-SEED-${i}`
        });

        await PaymentAllocation.create({
          schoolId: school._id,
          paymentId: payment._id,
          invoiceId: invoice._id,
          studentId: student._id,
          allocatedAmount: paidAmt,
          allocationDate: new Date('2026-09-05'),
          allocatedBy: adminUser._id
        });

        await StudentLedger.create({
          schoolId: school._id,
          academicYearId: currentAY._id,
          studentId: student._id,
          referenceType: 'PAYMENT',
          referenceId: payment._id,
          transactionType: 'CREDIT',
          debit: 0,
          credit: paidAmt,
          balance: balAmt,
          description: `Payment ${payNum} received via ${payment.paymentMethod}`,
          transactionDate: new Date('2026-09-05'),
          createdBy: adminUser._id
        });

        const recNum = `REC-2026-0000${i + 1}`;
        await Receipt.create({
          schoolId: school._id,
          studentId: student._id,
          paymentId: payment._id,
          receiptNumber: recNum,
          receiptDate: new Date('2026-09-05'),
          amount: paidAmt,
          paymentMethod: payment.paymentMethod,
          referenceNumber: payment.referenceNumber,
          allocatedInvoices: [
            {
              invoiceId: invoice._id,
              invoiceNumber: invoice.invoiceNumber,
              allocatedAmount: paidAmt
            }
          ],
          status: 'ISSUED',
          generatedAt: new Date('2026-09-05'),
          generatedBy: adminUser._id
        });
      }
    }
    console.log('✅ Phase 5 Fee Engine, Invoices, Payments, Receipts & Append-Only Ledger seeded.');

    // 18. Phase 6: Seed Communication Engine, Announcements, Notifications & Templates
    console.log('🌱 Seeding Phase 6 Communication & Notification Engine...');

    const ann1 = await Announcement.create({
      schoolId: school._id,
      academicYearId: currentAY._id,
      title: 'Welcome to Academic Year 2026-2027',
      content: 'We are delighted to welcome all students, parents, and teachers to Green Valley International School for the new academic session.',
      summary: 'Welcome message for the 2026-2027 academic session.',
      announcementType: 'GENERAL',
      priority: 'HIGH',
      audienceType: 'SCHOOL',
      publishAt: new Date('2026-06-01'),
      status: 'PUBLISHED',
      createdBy: adminUser._id,
      publishedBy: adminUser._id,
      publishedAt: new Date('2026-06-01')
    });

    const ann2 = await Announcement.create({
      schoolId: school._id,
      academicYearId: currentAY._id,
      title: 'Grade 8 Mid-Term Examination Schedule',
      content: 'The Mid-Term examination schedule for Grade 8 has been published. Exams begin next Monday.',
      summary: 'Grade 8 Mid-Term Exam Announcement.',
      announcementType: 'EXAM',
      priority: 'URGENT',
      audienceType: 'GRADE',
      targetGradeIds: [gradeDocs[2]?._id || gradeDocs[0]._id],
      publishAt: new Date('2026-09-10'),
      status: 'PUBLISHED',
      createdBy: adminUser._id,
      publishedBy: adminUser._id,
      publishedAt: new Date('2026-09-10')
    });

    // Seed Notification Templates
    await NotificationTemplate.create({
      schoolId: school._id,
      name: 'Monthly Fee Invoice Issued',
      code: 'FEE_INVOICE_ISSUED',
      category: 'FEE',
      channel: 'IN_APP',
      subject: 'Monthly Fee Invoice {{invoiceNumber}}',
      body: 'Dear {{parentName}}, the fee invoice {{invoiceNumber}} for {{studentName}} has been generated.',
      variables: ['parentName', 'invoiceNumber', 'studentName'],
      status: 'ACTIVE',
      createdBy: adminUser._id
    });

    await NotificationTemplate.create({
      schoolId: school._id,
      name: 'Fee Payment Received Confirmation',
      code: 'FEE_PAYMENT_SUCCESS',
      category: 'PAYMENT',
      channel: 'IN_APP',
      subject: 'Payment Receipt {{receiptNumber}}',
      body: 'Payment of ₹{{amount}} for {{studentName}} has been successfully collected via {{paymentMethod}}.',
      variables: ['amount', 'studentName', 'paymentMethod'],
      status: 'ACTIVE',
      createdBy: adminUser._id
    });

    // Seed Notifications for admin user
    await Notification.create({
      schoolId: school._id,
      recipientUserId: adminUser._id,
      recipientType: 'ADMIN',
      category: 'SYSTEM',
      title: 'System Initialized',
      message: 'Multi-tenant ERP Phase 1-6 Platform fully active.',
      priority: 'NORMAL',
      channel: 'IN_APP',
      status: 'READ',
      deliveredAt: new Date()
    });

    await Notification.create({
      schoolId: school._id,
      recipientUserId: adminUser._id,
      recipientType: 'ADMIN',
      category: 'ANNOUNCEMENT',
      title: 'School Announcement Published',
      message: 'Welcome to Academic Year 2026-2027 announcement is now live.',
      priority: 'HIGH',
      channel: 'IN_APP',
      status: 'UNREAD',
      deliveredAt: new Date()
    });

    console.log('✅ Phase 6 Announcements, Notifications & Communication Engine seeded.');

    console.log('\n🎉 MongoDB School_Management Database Reset & Relational Seeding Completed!');
    console.log('--------------------------------------------------');
    console.log('🔑 Default Super Admin Credentials:');
    console.log('   Email: admin@schoolerp.com');
    console.log('   Password: admin123');
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Database Seeding Failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

seed();


