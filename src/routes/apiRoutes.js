const express = require('express');
const router = express.Router();
const { authenticate, requirePermissions } = require('../middleware/auth');
const validate = require('../shared/validation/validate');
const {
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
  updateSettingsSchema,
  roleSchema,
  updateRoleSchema,
} = require('../shared/validation/schemas');

// Controllers
const schoolController = require('../controllers/schoolController');
const academicYearController = require('../controllers/academicYearController');
const academicTermController = require('../controllers/academicTermController');
const gradeController = require('../controllers/gradeController');
const sectionController = require('../controllers/sectionController');
const subjectController = require('../controllers/subjectController');
const classSubjectController = require('../controllers/classSubjectController');
const staffController = require('../controllers/staffController');
const teacherAssignmentController = require('../controllers/teacherAssignmentController');
const settingController = require('../controllers/settingController');
const auditLogController = require('../controllers/auditLogController');
const roleController = require('../controllers/roleController');

// All API routes require authentication
router.use(authenticate);

// --- School & Campus Routes ---
router.get('/schools/profile', requirePermissions('school.view'), schoolController.getSchoolProfile);
router.post('/schools/profile', requirePermissions('school.manage'), validate(schoolProfileSchema), schoolController.updateSchoolProfile);
router.get('/campuses', requirePermissions('campus.view'), schoolController.getCampuses);
router.post('/campuses', requirePermissions('campus.manage'), validate(campusSchema), schoolController.createCampus);
router.patch('/campuses/:id', requirePermissions('campus.manage'), validate(updateCampusSchema), schoolController.updateCampus);
router.delete('/campuses/:id', requirePermissions('campus.manage'), schoolController.deleteCampus);

// --- Academic Years ---
router.get('/academic-years', requirePermissions('academic_year.view'), academicYearController.getAcademicYears);
router.get('/academic-years/current', requirePermissions('academic_year.view'), academicYearController.getCurrentAcademicYear);
router.post('/academic-years', requirePermissions('academic_year.manage'), validate(academicYearSchema), academicYearController.createAcademicYear);
router.patch('/academic-years/:id', requirePermissions('academic_year.manage'), validate(updateAcademicYearSchema), academicYearController.updateAcademicYear);
router.post('/academic-years/:id/set-current', requirePermissions('academic_year.manage'), academicYearController.setCurrentAcademicYear);
router.delete('/academic-years/:id', requirePermissions('academic_year.manage'), academicYearController.deleteAcademicYear);

// --- Academic Terms ---
router.get('/academic-terms', requirePermissions('academic_term.view'), academicTermController.getAcademicTerms);
router.post('/academic-terms', requirePermissions('academic_term.manage'), validate(academicTermSchema), academicTermController.createAcademicTerm);
router.patch('/academic-terms/:id', requirePermissions('academic_term.manage'), validate(updateAcademicTermSchema), academicTermController.updateAcademicTerm);
router.delete('/academic-terms/:id', requirePermissions('academic_term.manage'), academicTermController.deleteAcademicTerm);

// --- Grades / Classes ---
router.get('/grades', requirePermissions('grade.view'), gradeController.getGrades);
router.post('/grades', requirePermissions('grade.manage'), validate(gradeSchema), gradeController.createGrade);
router.patch('/grades/:id', requirePermissions('grade.manage'), validate(updateGradeSchema), gradeController.updateGrade);
router.delete('/grades/:id', requirePermissions('grade.manage'), gradeController.deleteGrade);

// --- Sections ---
router.get('/sections', requirePermissions('section.view'), sectionController.getSections);
router.post('/sections', requirePermissions('section.manage'), validate(sectionSchema), sectionController.createSection);
router.patch('/sections/:id', requirePermissions('section.manage'), validate(updateSectionSchema), sectionController.updateSection);
router.delete('/sections/:id', requirePermissions('section.manage'), sectionController.deleteSection);

// --- Master Subjects ---
router.get('/subjects', requirePermissions('subject.view'), subjectController.getSubjects);
router.post('/subjects', requirePermissions('subject.manage'), validate(subjectSchema), subjectController.createSubject);
router.patch('/subjects/:id', requirePermissions('subject.manage'), validate(updateSubjectSchema), subjectController.updateSubject);
router.delete('/subjects/:id', requirePermissions('subject.manage'), subjectController.deleteSubject);

// --- Class Subject Configuration ---
router.get('/class-subjects', requirePermissions('class_subject.view'), classSubjectController.getClassSubjects);
router.post('/class-subjects', requirePermissions('class_subject.manage'), validate(classSubjectSchema), classSubjectController.createClassSubject);
router.post('/class-subjects/bulk', requirePermissions('class_subject.manage'), validate(bulkClassSubjectSchema), classSubjectController.saveBulkClassSubjects);
router.patch('/class-subjects/:id', requirePermissions('class_subject.manage'), validate(updateClassSubjectSchema), classSubjectController.updateClassSubject);
router.delete('/class-subjects/:id', requirePermissions('class_subject.manage'), classSubjectController.deleteClassSubject);

// --- Staff / Teachers ---
router.get('/staff', requirePermissions('staff.view'), staffController.getStaff);
router.post('/staff', requirePermissions('staff.manage'), validate(staffSchema), staffController.createStaff);
router.patch('/staff/:id', requirePermissions('staff.manage'), validate(updateStaffSchema), staffController.updateStaff);
router.delete('/staff/:id', requirePermissions('staff.manage'), staffController.deleteStaff);

// --- Teacher Assignments ---
router.get('/teacher-assignments', requirePermissions('teacher_assignment.view'), teacherAssignmentController.getTeacherAssignments);
router.post('/teacher-assignments', requirePermissions('teacher_assignment.manage'), validate(teacherAssignmentSchema), teacherAssignmentController.createTeacherAssignment);
router.delete('/teacher-assignments/:id', requirePermissions('teacher_assignment.manage'), teacherAssignmentController.deleteTeacherAssignment);

// --- Settings ---
router.get('/settings', requirePermissions('settings.view'), settingController.getSettings);
router.patch('/settings', requirePermissions('settings.manage'), validate(updateSettingsSchema), settingController.updateSettings);

// --- Audit Logs & Roles ---
router.get('/audit-logs', requirePermissions('audit.view'), auditLogController.getAuditLogs);
router.get('/roles', requirePermissions('role.view'), roleController.getRoles);
router.get('/roles/:id', requirePermissions('role.view'), roleController.getRoleById);
router.post('/roles', requirePermissions('role.manage'), validate(roleSchema), roleController.createRole);
router.put('/roles/:id', requirePermissions('role.manage'), validate(updateRoleSchema), roleController.updateRole);
router.patch('/roles/:id/status', requirePermissions('role.manage'), roleController.toggleRoleStatus);
router.delete('/roles/:id', requirePermissions('role.manage'), roleController.deleteRole);
router.get('/permissions', requirePermissions('role.view'), roleController.getPermissions);

module.exports = router;
