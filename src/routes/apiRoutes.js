const express = require('express');
const router = express.Router();
const { authenticate, requirePermissions } = require('../middleware/auth');

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

// All routes require authentication
router.use(authenticate);

// --- School & Campus Routes ---
router.get('/schools/profile', schoolController.getSchoolProfile);
router.post('/schools/profile', requirePermissions('school.manage'), schoolController.updateSchoolProfile);
router.get('/campuses', schoolController.getCampuses);
router.post('/campuses', requirePermissions('school.manage'), schoolController.createCampus);
router.patch('/campuses/:id', requirePermissions('school.manage'), schoolController.updateCampus);
router.delete('/campuses/:id', requirePermissions('school.manage'), schoolController.deleteCampus);

// --- Academic Years ---
router.get('/academic-years', academicYearController.getAcademicYears);
router.get('/academic-years/current', academicYearController.getCurrentAcademicYear);
router.post('/academic-years', requirePermissions('academic_year.manage'), academicYearController.createAcademicYear);
router.patch('/academic-years/:id', requirePermissions('academic_year.manage'), academicYearController.updateAcademicYear);
router.post('/academic-years/:id/set-current', requirePermissions('academic_year.manage'), academicYearController.setCurrentAcademicYear);
router.delete('/academic-years/:id', requirePermissions('academic_year.manage'), academicYearController.deleteAcademicYear);

// --- Academic Terms ---
router.get('/academic-terms', academicTermController.getAcademicTerms);
router.post('/academic-terms', requirePermissions('academic_term.manage'), academicTermController.createAcademicTerm);
router.patch('/academic-terms/:id', requirePermissions('academic_term.manage'), academicTermController.updateAcademicTerm);
router.delete('/academic-terms/:id', requirePermissions('academic_term.manage'), academicTermController.deleteAcademicTerm);

// --- Grades / Classes ---
router.get('/grades', gradeController.getGrades);
router.post('/grades', requirePermissions('grade.manage'), gradeController.createGrade);
router.patch('/grades/:id', requirePermissions('grade.manage'), gradeController.updateGrade);
router.delete('/grades/:id', requirePermissions('grade.manage'), gradeController.deleteGrade);

// --- Sections ---
router.get('/sections', sectionController.getSections);
router.post('/sections', requirePermissions('section.manage'), sectionController.createSection);
router.patch('/sections/:id', requirePermissions('section.manage'), sectionController.updateSection);
router.delete('/sections/:id', requirePermissions('section.manage'), sectionController.deleteSection);

// --- Master Subjects ---
router.get('/subjects', subjectController.getSubjects);
router.post('/subjects', requirePermissions('subject.manage'), subjectController.createSubject);
router.patch('/subjects/:id', requirePermissions('subject.manage'), subjectController.updateSubject);
router.delete('/subjects/:id', requirePermissions('subject.manage'), subjectController.deleteSubject);

// --- Class Subject Configuration ---
router.get('/class-subjects', classSubjectController.getClassSubjects);
router.post('/class-subjects', requirePermissions('class_subject.manage'), classSubjectController.createClassSubject);
router.post('/class-subjects/bulk', requirePermissions('class_subject.manage'), classSubjectController.saveBulkClassSubjects);
router.patch('/class-subjects/:id', requirePermissions('class_subject.manage'), classSubjectController.updateClassSubject);
router.delete('/class-subjects/:id', requirePermissions('class_subject.manage'), classSubjectController.deleteClassSubject);

// --- Staff / Teachers ---
router.get('/staff', staffController.getStaff);
router.post('/staff', requirePermissions('staff.manage'), staffController.createStaff);
router.patch('/staff/:id', requirePermissions('staff.manage'), staffController.updateStaff);
router.delete('/staff/:id', requirePermissions('staff.manage'), staffController.deleteStaff);

// --- Teacher Assignments ---
router.get('/teacher-assignments', teacherAssignmentController.getTeacherAssignments);
router.post('/teacher-assignments', requirePermissions('teacher_assignment.manage'), teacherAssignmentController.createTeacherAssignment);
router.delete('/teacher-assignments/:id', requirePermissions('teacher_assignment.manage'), teacherAssignmentController.deleteTeacherAssignment);

// --- Settings ---
router.get('/settings', settingController.getSettings);
router.patch('/settings', requirePermissions('settings.manage'), settingController.updateSettings);

// --- Audit Logs & Roles ---
router.get('/audit-logs', requirePermissions('audit.view'), auditLogController.getAuditLogs);
router.get('/roles', roleController.getRoles);
router.get('/roles/:id', roleController.getRoleById);
router.post('/roles', requirePermissions('school.manage'), roleController.createRole);
router.put('/roles/:id', requirePermissions('school.manage'), roleController.updateRole);
router.patch('/roles/:id/status', requirePermissions('school.manage'), roleController.toggleRoleStatus);
router.delete('/roles/:id', requirePermissions('school.manage'), roleController.deleteRole);
router.get('/permissions', roleController.getPermissions);

module.exports = router;
