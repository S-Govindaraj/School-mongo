const express = require('express');
const router = express.Router();
const { authenticate, optionalAuthenticate, requirePermissions } = require('../middleware/auth');
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
  studentSchema,
  updateStudentSchema,
  studentStatusSchema,
  guardianSchema,
  updateGuardianSchema,
  admissionSchema,
  updateAdmissionStatusSchema,
  enrollmentSchema,
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
const studentController = require('../controllers/studentController');
const guardianController = require('../controllers/guardianController');
const admissionController = require('../controllers/admissionController');
const enrollmentController = require('../controllers/enrollmentController');
const documentController = require('../controllers/documentController');
const periodController = require('../controllers/periodController');
const timetableController = require('../controllers/timetableController');
const attendanceStatusController = require('../controllers/attendanceStatusController');
const attendanceController = require('../controllers/attendanceController');
const leaveRequestController = require('../controllers/leaveRequestController');

// Phase 5 Controllers
const feeCategoryController = require('../controllers/feeCategoryController');
const feeStructureController = require('../controllers/feeStructureController');
const feeAssignmentController = require('../controllers/feeAssignmentController');
const concessionController = require('../controllers/concessionController');
const fineRuleController = require('../controllers/fineRuleController');
const invoiceController = require('../controllers/invoiceController');
const paymentController = require('../controllers/paymentController');
const receiptController = require('../controllers/receiptController');
const refundController = require('../controllers/refundController');
const ledgerController = require('../controllers/ledgerController');
const financialAdjustmentController = require('../controllers/financialAdjustmentController');
const financeDashboardController = require('../controllers/financeDashboardController');
const errorLogController = require('../controllers/errorLogController');

// Client-side error reporting (accepts optional auth so pre-login & unhandled frontend errors are captured)
router.post('/error-logs/client', optionalAuthenticate, errorLogController.recordClientError);

// All other API routes require authentication
router.use(authenticate);

// --- School & Campus Routes ---
router.get('/schools/profile', requirePermissions('school_view'), schoolController.getSchoolProfile);
router.post('/schools/profile', requirePermissions('school_manage'), validate(schoolProfileSchema), schoolController.updateSchoolProfile);
router.get('/campuses', requirePermissions('campus_view'), schoolController.getCampuses);
router.post('/campuses', requirePermissions('campus_manage'), validate(campusSchema), schoolController.createCampus);
router.patch('/campuses/:id', requirePermissions('campus_manage'), validate(updateCampusSchema), schoolController.updateCampus);
router.delete('/campuses/:id', requirePermissions('campus_manage'), schoolController.deleteCampus);

// --- Academic Years ---
router.get('/academic-years', requirePermissions('academic_year_view'), academicYearController.getAcademicYears);
router.get('/academic-years/current', requirePermissions('academic_year_view'), academicYearController.getCurrentAcademicYear);
router.post('/academic-years', requirePermissions('academic_year_manage'), validate(academicYearSchema), academicYearController.createAcademicYear);
router.patch('/academic-years/:id', requirePermissions('academic_year_manage'), validate(updateAcademicYearSchema), academicYearController.updateAcademicYear);
router.post('/academic-years/:id/set-current', requirePermissions('academic_year_manage'), academicYearController.setCurrentAcademicYear);
router.delete('/academic-years/:id', requirePermissions('academic_year_manage'), academicYearController.deleteAcademicYear);

// --- Academic Terms ---
router.get('/academic-terms', requirePermissions('academic_term_view'), academicTermController.getAcademicTerms);
router.post('/academic-terms', requirePermissions('academic_term_manage'), validate(academicTermSchema), academicTermController.createAcademicTerm);
router.patch('/academic-terms/:id', requirePermissions('academic_term_manage'), validate(updateAcademicTermSchema), academicTermController.updateAcademicTerm);
router.delete('/academic-terms/:id', requirePermissions('academic_term_manage'), academicTermController.deleteAcademicTerm);

// --- Grades / Classes ---
router.get('/grades', requirePermissions('grade_view'), gradeController.getGrades);
router.post('/grades', requirePermissions('grade_manage'), validate(gradeSchema), gradeController.createGrade);
router.patch('/grades/:id', requirePermissions('grade_manage'), validate(updateGradeSchema), gradeController.updateGrade);
router.delete('/grades/:id', requirePermissions('grade_manage'), gradeController.deleteGrade);

// --- Sections ---
router.get('/sections', requirePermissions('section_view'), sectionController.getSections);
router.post('/sections', requirePermissions('section_manage'), validate(sectionSchema), sectionController.createSection);
router.patch('/sections/:id', requirePermissions('section_manage'), validate(updateSectionSchema), sectionController.updateSection);
router.delete('/sections/:id', requirePermissions('section_manage'), sectionController.deleteSection);

// --- Master Subjects ---
router.get('/subjects', requirePermissions('subject_view'), subjectController.getSubjects);
router.post('/subjects', requirePermissions('subject_manage'), validate(subjectSchema), subjectController.createSubject);
router.patch('/subjects/:id', requirePermissions('subject_manage'), validate(updateSubjectSchema), subjectController.updateSubject);
router.delete('/subjects/:id', requirePermissions('subject_manage'), subjectController.deleteSubject);

// --- Class Subjects ---
router.get('/class-subjects', requirePermissions('class_subject_view'), classSubjectController.getClassSubjects);
router.post('/class-subjects', requirePermissions('class_subject_manage'), validate(classSubjectSchema), classSubjectController.createClassSubject);
router.post('/class-subjects/bulk', requirePermissions('class_subject_manage'), validate(bulkClassSubjectSchema), classSubjectController.createBulkClassSubjects);
router.patch('/class-subjects/:id', requirePermissions('class_subject_manage'), validate(updateClassSubjectSchema), classSubjectController.updateClassSubject);
router.delete('/class-subjects/:id', requirePermissions('class_subject_manage'), classSubjectController.deleteClassSubject);

// --- Staff & Teachers ---
router.get('/staff', requirePermissions('staff_view'), staffController.getStaff);
router.get('/staff/:id', requirePermissions('staff_view'), staffController.getStaffById);
router.post('/staff', requirePermissions('staff_manage'), validate(staffSchema), staffController.createStaff);
router.patch('/staff/:id', requirePermissions('staff_manage'), validate(updateStaffSchema), staffController.updateStaff);
router.delete('/staff/:id', requirePermissions('staff_manage'), staffController.deleteStaff);

// --- Teacher Assignments ---
router.get('/teacher-assignments', requirePermissions('teacher_assignment_view'), teacherAssignmentController.getTeacherAssignments);
router.post('/teacher-assignments', requirePermissions('teacher_assignment_manage'), validate(teacherAssignmentSchema), teacherAssignmentController.createTeacherAssignment);
router.delete('/teacher-assignments/:id', requirePermissions('teacher_assignment_manage'), teacherAssignmentController.deleteTeacherAssignment);

// --- Student 360 ---
router.get('/students', requirePermissions('student_view'), studentController.getStudents);
router.get('/students/:id', requirePermissions('student_view'), studentController.getStudentById);
router.post('/students', requirePermissions('student_create'), validate(studentSchema), studentController.createStudent);
router.patch('/students/:id', requirePermissions('student_update'), validate(updateStudentSchema), studentController.updateStudent);
router.patch('/students/:id/status', requirePermissions('student_status_change'), validate(studentStatusSchema), studentController.updateStudentStatus);
router.delete('/students/:id', requirePermissions('student_archive'), studentController.deleteStudent);

// --- Guardians ---
router.get('/guardians', requirePermissions('guardian_view'), guardianController.getGuardians);
router.get('/guardians/:id', requirePermissions('guardian_view'), guardianController.getGuardianById);
router.post('/guardians', requirePermissions('guardian_create'), validate(guardianSchema), guardianController.createGuardian);
router.patch('/guardians/:id', requirePermissions('guardian_update'), validate(updateGuardianSchema), guardianController.updateGuardian);
router.post('/students/:studentId/guardians', requirePermissions('guardian_create'), guardianController.linkGuardianToStudent);

// --- Admissions ---
router.get('/admissions', requirePermissions('admission_view'), admissionController.getAdmissions);
router.get('/admissions/:id', requirePermissions('admission_view'), admissionController.getAdmissionById);
router.post('/admissions', requirePermissions('admission_create'), validate(admissionSchema), admissionController.createAdmission);
router.patch('/admissions/:id/status', requirePermissions('admission_status_change'), validate(updateAdmissionStatusSchema), admissionController.updateAdmissionStatus);
router.post('/admissions/:id/admit', requirePermissions('admission_status_change'), admissionController.admitStudent);

// --- Enrollments ---
router.get('/enrollments', requirePermissions('enrollment_view'), enrollmentController.getEnrollments);
router.post('/enrollments', requirePermissions('enrollment_create'), validate(enrollmentSchema), enrollmentController.createEnrollment);
router.post('/enrollments/promote', requirePermissions('enrollment_promote'), enrollmentController.promoteStudents);

// --- Documents ---
router.get('/students/:studentId/documents', requirePermissions('student_view'), documentController.getStudentDocuments);
router.post('/students/:studentId/documents', requirePermissions('student_update'), documentController.uploadDocument);
router.delete('/documents/:id', requirePermissions('student_archive'), documentController.deleteDocument);

// --- Settings ---
router.get('/settings', requirePermissions('settings_view'), settingController.getSettings);
router.patch('/settings', requirePermissions('settings_manage'), validate(updateSettingsSchema), settingController.updateSettings);

// --- Audit Logs & Roles ---
router.get('/audit-logs', requirePermissions('audit_view'), auditLogController.getAuditLogs);
router.get('/roles', requirePermissions('role_view'), roleController.getRoles);
router.get('/roles/:id', requirePermissions('role_view'), roleController.getRoleById);
router.post('/roles', requirePermissions('role_manage'), validate(roleSchema), roleController.createRole);
router.put('/roles/:id', requirePermissions('role_manage'), validate(updateRoleSchema), roleController.updateRole);
router.patch('/roles/:id/status', requirePermissions('role_manage'), roleController.toggleRoleStatus);
router.delete('/roles/:id', requirePermissions('role_manage'), roleController.deleteRole);
router.get('/permissions', requirePermissions('role_view'), roleController.getPermissions);

// --- Phase 3: Period Bell Schedules ---
router.get('/periods', requirePermissions('period_view'), periodController.getPeriods);
router.post('/periods', requirePermissions('period_manage'), periodController.createPeriod);
router.patch('/periods/:id', requirePermissions('period_manage'), periodController.updatePeriod);
router.delete('/periods/:id', requirePermissions('period_manage'), periodController.deletePeriod);

// --- Phase 3: Timetable Matrix ---
router.get('/timetables', requirePermissions('timetable_view'), timetableController.getTimetables);
router.get('/timetables/section/:sectionId', requirePermissions('timetable_view'), timetableController.getSectionTimetable);
router.get('/timetables/teacher/:teacherId', requirePermissions('timetable_view'), timetableController.getTeacherTimetable);
router.post('/timetables', requirePermissions('timetable_manage'), timetableController.createTimetableEntry);
router.patch('/timetables/:id', requirePermissions('timetable_manage'), timetableController.updateTimetableEntry);
router.delete('/timetables/:id', requirePermissions('timetable_manage'), timetableController.deleteTimetableEntry);

// --- Phase 3: Configurable Attendance Statuses ---
router.get('/attendance/statuses', requirePermissions('attendance_status_view'), attendanceStatusController.getAttendanceStatuses);
router.post('/attendance/statuses', requirePermissions('attendance_status_manage'), attendanceStatusController.createAttendanceStatus);
router.patch('/attendance/statuses/:id', requirePermissions('attendance_status_manage'), attendanceStatusController.updateAttendanceStatus);

// --- Phase 3: Attendance Sessions & Marking Workspace ---
router.get('/attendance/sessions', requirePermissions('attendance_view'), attendanceController.getAttendanceSessions);
router.post('/attendance/sessions', requirePermissions('attendance_mark'), attendanceController.createAttendanceSession);
router.post('/attendance/sessions/mark-bulk', requirePermissions('attendance_mark'), attendanceController.markBulkAttendance);
router.get('/attendance/records', requirePermissions('attendance_view'), attendanceController.getAttendanceRecords);
router.patch('/attendance/records/:id', requirePermissions('attendance_correct'), attendanceController.correctAttendanceRecord);
router.post('/attendance/records/:id/correct', requirePermissions('attendance_correct'), attendanceController.correctAttendanceRecord);

// --- Phase 3: Attendance Summaries & Reports ---
router.get('/attendance/students/:studentId/summary', requirePermissions('attendance_view'), attendanceController.getStudentAttendanceSummary);
router.get('/attendance/sections/:sectionId/summary', requirePermissions('attendance_view'), attendanceController.getSectionAttendanceSummary);
router.get('/attendance/summary', requirePermissions('attendance_report'), attendanceController.getSchoolAttendanceSummary);

// --- Phase 3: Leave Applications ---
router.get('/leave-requests', requirePermissions('leave_view'), leaveRequestController.getLeaveRequests);
router.post('/leave-requests', requirePermissions('leave_create'), leaveRequestController.createLeaveRequest);
router.patch('/leave-requests/:id/status', requirePermissions('leave_approve'), leaveRequestController.updateLeaveStatus);

// --- Phase 5: Fees & Financial Operations ---
// Fee Categories
router.get('/fee-categories', requirePermissions('fee_category_view'), feeCategoryController.getFeeCategories);
router.post('/fee-categories', requirePermissions('fee_category_create'), feeCategoryController.createFeeCategory);
router.patch('/fee-categories/:id', requirePermissions('fee_category_update'), feeCategoryController.updateFeeCategory);
router.delete('/fee-categories/:id', requirePermissions('fee_category_delete'), feeCategoryController.deleteFeeCategory);

// Fee Structures
router.get('/fee-structures', requirePermissions('fee_structure_view'), feeStructureController.getFeeStructures);
router.get('/fee-structures/:id', requirePermissions('fee_structure_view'), feeStructureController.getFeeStructureById);
router.post('/fee-structures', requirePermissions('fee_structure_create'), feeStructureController.createFeeStructure);
router.patch('/fee-structures/:id', requirePermissions('fee_structure_update'), feeStructureController.updateFeeStructure);
router.delete('/fee-structures/:id', requirePermissions('fee_structure_delete'), feeStructureController.deleteFeeStructure);

// Student Fee Assignments
router.get('/student-fee-assignments', requirePermissions('fee_assignment_view'), feeAssignmentController.getFeeAssignments);
router.post('/student-fee-assignments', requirePermissions('fee_assignment_create'), feeAssignmentController.assignFeeToStudents);
router.patch('/student-fee-assignments/:id', requirePermissions('fee_assignment_update'), feeAssignmentController.updateFeeAssignment);

// Concessions
router.get('/concessions', requirePermissions('concession_view'), concessionController.getConcessions);
router.post('/concessions', requirePermissions('concession_create'), concessionController.createConcession);
router.patch('/concessions/:id/status', requirePermissions('concession_approve'), concessionController.updateConcessionStatus);

// Fine Rules
router.get('/fine-rules', requirePermissions('fine_rule_view'), fineRuleController.getFineRules);
router.post('/fine-rules', requirePermissions('fine_rule_create'), fineRuleController.createFineRule);
router.patch('/fine-rules/:id', requirePermissions('fine_rule_update'), fineRuleController.updateFineRule);
router.delete('/fine-rules/:id', requirePermissions('fine_rule_delete'), fineRuleController.deleteFineRule);

// Invoices & Invoice Engine
router.get('/invoices', requirePermissions('invoice_view'), invoiceController.getInvoices);
router.get('/invoices/:id', requirePermissions('invoice_view'), invoiceController.getInvoiceById);
router.post('/invoices/generate-bulk', requirePermissions('invoice_create'), invoiceController.generateBulkInvoices);
router.patch('/invoices/:id/status', requirePermissions('invoice_update'), invoiceController.updateInvoiceStatus);

// Payments & Idempotent Collection
router.get('/payments', requirePermissions('payment_view'), paymentController.getPayments);
router.get('/payments/:id', requirePermissions('payment_view'), paymentController.getPaymentById);
router.post('/payments', requirePermissions('payment_create'), paymentController.collectPayment);

// Receipts
router.get('/receipts', requirePermissions('receipt_view'), receiptController.getReceipts);
router.get('/receipts/:id', requirePermissions('receipt_view'), receiptController.getReceiptById);

// Refunds
router.get('/refunds', requirePermissions('refund_view'), refundController.getRefunds);
router.post('/refunds', requirePermissions('refund_create'), refundController.createRefund);
router.patch('/refunds/:id/status', requirePermissions('refund_approve'), refundController.updateRefundStatus);

// Append-only Student Ledger
router.get('/student-ledgers', requirePermissions('ledger_view'), ledgerController.getStudentLedger);

// Financial Adjustments
router.get('/financial-adjustments', requirePermissions('financial_adjustment_view'), financialAdjustmentController.getAdjustments);
router.post('/financial-adjustments', requirePermissions('financial_adjustment_create'), financialAdjustmentController.createAdjustment);
// Dashboard & Reporting
router.get('/finance/dashboard', requirePermissions('finance_dashboard_view'), financeDashboardController.getFinanceDashboardData);

// Phase 6 Controllers
const portalAdminController = require('../controllers/portalAdminController');
const portalTeacherController = require('../controllers/portalTeacherController');
const portalParentController = require('../controllers/portalParentController');
const portalStudentController = require('../controllers/portalStudentController');
const announcementController = require('../controllers/announcementController');
const notificationController = require('../controllers/notificationController');
const notificationPreferenceController = require('../controllers/notificationPreferenceController');
const communicationCenterController = require('../controllers/communicationCenterController');

// --- Phase 6: Portals, Announcements & Communication Center ---
// Portals
router.get('/portal/admin/dashboard', requirePermissions('school_view'), portalAdminController.getAdminDashboardData);
router.get('/portal/teacher/dashboard', requirePermissions('teacher_portal_view'), portalTeacherController.getTeacherDashboardData);
router.get('/portal/teacher/today', requirePermissions('teacher_portal_view'), portalTeacherController.getTeacherTodayClasses);
router.get('/portal/teacher/students', requirePermissions('teacher_portal_view'), portalTeacherController.getTeacherAssignedStudents);

router.get('/portal/parent/children', requirePermissions('parent_portal_view'), portalParentController.getParentChildren);
router.get('/portal/parent/dashboard', requirePermissions('parent_portal_view'), portalParentController.getParentDashboardData);
router.get('/portal/parent/children/:studentId/attendance', requirePermissions('parent_portal_view'), portalParentController.getChildAttendance);
router.get('/portal/parent/children/:studentId/fees', requirePermissions('parent_portal_view'), portalParentController.getChildFees);

router.get('/portal/student/dashboard', requirePermissions('student_portal_view'), portalStudentController.getStudentDashboardData);

// Announcements
router.get('/announcements', requirePermissions('announcement_view'), announcementController.getAnnouncements);
router.post('/announcements', requirePermissions('announcement_create'), announcementController.createAnnouncement);
router.post('/announcements/:id/publish', requirePermissions('announcement_publish'), announcementController.publishAnnouncement);

// Notifications & Preferences (All authenticated users can access their own notifications)
router.get('/notifications', notificationController.getNotifications);
router.get('/notifications/unread-count', notificationController.getUnreadNotificationCount);
router.patch('/notifications/:id/read', notificationController.markNotificationRead);
router.post('/notifications/read-all', notificationController.markAllNotificationsRead);

router.get('/notification-preferences', requirePermissions('notification_preference_view'), notificationPreferenceController.getNotificationPreferences);
router.patch('/notification-preferences', requirePermissions('notification_preference_update'), notificationPreferenceController.updateNotificationPreferences);

// Communication Center Analytics & Templates
router.get('/communication/analytics', requirePermissions('communication_dashboard_view'), communicationCenterController.getCommunicationAnalytics);
router.get('/communication/templates', requirePermissions('communication_dashboard_view'), communicationCenterController.getNotificationTemplates);
router.post('/communication/templates', requirePermissions('communication_dashboard_view'), communicationCenterController.createNotificationTemplate);
router.post('/communication/send-message', requirePermissions('communication_dashboard_view'), communicationCenterController.sendMessage);
// Phase 7 Controllers
const transportController = require('../controllers/transportController');
const libraryController = require('../controllers/libraryController');
const docManagementController = require('../controllers/documentController');
const reportController = require('../controllers/reportController');
const analyticsController = require('../controllers/analyticsController');
const exportController = require('../controllers/exportController');
const searchController = require('../controllers/searchController');

// All API routes require authentication
router.use(authenticate);

// --- Phase 7: Transport Management ---
router.get('/transport/dashboard', requirePermissions('vehicle_view'), transportController.getDashboard);
router.get('/transport/vehicles', requirePermissions('vehicle_view'), transportController.getVehicles);
router.post('/transport/vehicles', requirePermissions('vehicle_create'), transportController.createVehicle);
router.patch('/transport/vehicles/:id', requirePermissions('vehicle_update'), transportController.updateVehicle);

router.get('/transport/drivers', requirePermissions('driver_view'), transportController.getDrivers);
router.post('/transport/drivers', requirePermissions('driver_create'), transportController.createDriver);
router.patch('/transport/drivers/:id', requirePermissions('driver_update'), transportController.updateDriver);

router.get('/transport/routes', requirePermissions('route_view'), transportController.getRoutes);
router.post('/transport/routes', requirePermissions('route_create'), transportController.createRoute);
router.patch('/transport/routes/:id', requirePermissions('route_update'), transportController.updateRoute);
router.get('/transport/routes/:routeId/stops', requirePermissions('route_view'), transportController.getRouteStops);
router.post('/transport/stops', requirePermissions('route_create'), transportController.createRouteStop);

router.get('/transport/assignments', requirePermissions('transport_assignment_view'), transportController.getAssignments);
router.post('/transport/assignments', requirePermissions('transport_assignment_create'), transportController.createAssignment);

router.get('/transport/attendance', requirePermissions('transport_attendance_view'), transportController.getAttendance);
router.post('/transport/attendance', requirePermissions('transport_attendance_mark'), transportController.markAttendance);

// --- Phase 7: Library Management ---
router.get('/library/dashboard', requirePermissions('library_view'), libraryController.getDashboard);
router.get('/library/libraries', requirePermissions('library_view'), libraryController.getLibraries);
router.post('/library/libraries', requirePermissions('library_create'), libraryController.createLibrary);

router.get('/library/categories', requirePermissions('book_view'), libraryController.getCategories);
router.post('/library/categories', requirePermissions('book_create'), libraryController.createCategory);
router.get('/library/authors', requirePermissions('book_view'), libraryController.getAuthors);
router.post('/library/authors', requirePermissions('book_create'), libraryController.createAuthor);
router.get('/library/publishers', requirePermissions('book_view'), libraryController.getPublishers);
router.post('/library/publishers', requirePermissions('book_create'), libraryController.createPublisher);

router.get('/library/books', requirePermissions('book_view'), libraryController.getBooks);
router.post('/library/books', requirePermissions('book_create'), libraryController.createBook);
router.get('/library/copies', requirePermissions('book_copy_view'), libraryController.getBookCopies);
router.post('/library/copies', requirePermissions('book_copy_create'), libraryController.createBookCopy);

router.get('/library/members', requirePermissions('library_member_view'), libraryController.getMembers);
router.post('/library/members', requirePermissions('library_member_create'), libraryController.createMember);

router.get('/library/issues', requirePermissions('book_issue_view'), libraryController.getIssues);
router.post('/library/issues', requirePermissions('book_issue_create'), libraryController.issueBook);
router.post('/library/returns', requirePermissions('book_issue_return'), libraryController.returnBook);

router.get('/library/settings', requirePermissions('library_view'), libraryController.getSettings);
router.patch('/library/settings', requirePermissions('library_manage'), libraryController.updateSettings);

// --- Phase 7: Document Management ---
router.get('/documents/dashboard', requirePermissions('document_view'), docManagementController.getDashboard);
router.get('/documents', requirePermissions('document_view'), docManagementController.getDocuments);
router.post('/documents/upload', requirePermissions('document_upload'), docManagementController.uploadDocument);
router.patch('/documents/:id/verify', requirePermissions('document_verify'), docManagementController.verifyDocument);
router.patch('/documents/:id/reject', requirePermissions('document_verify'), docManagementController.rejectDocument);
router.patch('/documents/:id/archive', requirePermissions('document_manage'), docManagementController.archiveDocument);
router.get('/documents/:id/versions', requirePermissions('document_view'), docManagementController.getDocumentVersions);

// --- Phase 7: Reporting Engine & Schedules ---
router.get('/reports/definitions', requirePermissions('report_view'), reportController.getDefinitions);
router.post('/reports/generate', requirePermissions('report_generate'), reportController.generateReport);
router.get('/reports/schedules', requirePermissions('report_schedule_view'), reportController.getSchedules);
router.post('/reports/schedules', requirePermissions('report_schedule_create'), reportController.createSchedule);

// --- Phase 7: Analytics Engine ---
router.get('/analytics/dashboard', requirePermissions('analytics_dashboard_view'), analyticsController.getExecutiveDashboard);
router.get('/analytics/academic', requirePermissions('academic_analytics_view'), analyticsController.getAcademicAnalytics);
router.get('/analytics/attendance', requirePermissions('attendance_analytics_view'), analyticsController.getAttendanceAnalytics);
router.get('/analytics/finance', requirePermissions('finance_analytics_view'), analyticsController.getFinanceAnalytics);
router.get('/analytics/operations', requirePermissions('analytics_dashboard_view'), analyticsController.getOperationalInsights);

// --- Phase 7: Export Engine ---
router.get('/exports', requirePermissions('export_view'), exportController.getExportJobs);
router.post('/exports', requirePermissions('export_create'), exportController.createExportJob);
router.get('/exports/download-file', requirePermissions('export_download'), exportController.downloadExport);

// --- Phase 7: Global Search ---
router.get('/search', requirePermissions('school_view'), searchController.globalSearch);

// ================================================================
// ================================================================
// PHASE 8 — CAMPUS OPERATIONS: HOSTEL, INVENTORY, ASSETS, VISITORS
// ================================================================
const hostelController = require('../controllers/hostelController');
const inventoryController = require('../controllers/inventoryController');
const assetController = require('../controllers/assetController');
const visitorController = require('../controllers/visitorController');

// --- Phase 8: Hostel Management ---
router.get('/hostel/hostels', requirePermissions('hostel_view'), hostelController.listHostels);
router.post('/hostel/hostels', requirePermissions('hostel_manage'), hostelController.createHostel);
router.get('/hostel/blocks', requirePermissions('hostel_view'), hostelController.listBlocks);
router.post('/hostel/blocks', requirePermissions('hostel_manage'), hostelController.createBlock);
router.get('/hostel/rooms', requirePermissions('hostel_view'), hostelController.listRooms);
router.post('/hostel/rooms', requirePermissions('hostel_manage'), hostelController.createRoom);
router.get('/hostel/beds', requirePermissions('hostel_view'), hostelController.listBeds);
router.get('/hostel/allocations', requirePermissions('hostel_allocation_view'), hostelController.listAllocations);
router.post('/hostel/allocations', requirePermissions('hostel_allocation_manage'), hostelController.allocate);
router.post('/hostel/allocations/:id/vacate', requirePermissions('hostel_allocation_manage'), hostelController.vacate);
router.post('/hostel/attendance', requirePermissions('hostel_attendance_mark'), hostelController.markHostelAttendance);

// --- Phase 8: Inventory & Procurement ---
router.get('/inventory/categories', requirePermissions('inventory_view'), inventoryController.listCategories);
router.post('/inventory/categories', requirePermissions('inventory_manage'), inventoryController.createCategory);
router.get('/inventory/items', requirePermissions('inventory_view'), inventoryController.listItems);
router.post('/inventory/items', requirePermissions('inventory_manage'), inventoryController.createItem);
router.get('/inventory/warehouses', requirePermissions('warehouse_view'), inventoryController.listWarehouses);
router.post('/inventory/warehouses', requirePermissions('warehouse_manage'), inventoryController.createWarehouse);
router.get('/inventory/stock', requirePermissions('stock_view'), inventoryController.getStock);
router.post('/inventory/stock/adjust', requirePermissions('stock_adjust'), inventoryController.adjustStock);
router.get('/inventory/vendors', requirePermissions('vendor_view'), inventoryController.listVendors);
router.post('/inventory/vendors', requirePermissions('vendor_manage'), inventoryController.createVendor);
router.get('/inventory/purchase-requests', requirePermissions('purchase_request_view'), inventoryController.listPRs);
router.post('/inventory/purchase-requests', requirePermissions('purchase_request_create'), inventoryController.createPR);
router.patch('/inventory/purchase-requests/:id/approve', requirePermissions('purchase_request_approve'), inventoryController.approvePR);
router.get('/inventory/purchase-orders', requirePermissions('purchase_order_view'), inventoryController.listPOs);
router.post('/inventory/purchase-orders', requirePermissions('purchase_order_create'), inventoryController.createPO);
router.post('/inventory/goods-receipt', requirePermissions('goods_receipt_create'), inventoryController.receiveGoods);

// --- Phase 8: Asset Management ---
router.get('/assets', requirePermissions('asset_view'), assetController.list);
router.get('/assets/:id', requirePermissions('asset_view'), assetController.getOne);
router.post('/assets', requirePermissions('asset_manage'), assetController.create);
router.put('/assets/:id', requirePermissions('asset_manage'), assetController.update);
router.post('/assets/:id/assign', requirePermissions('asset_assign'), assetController.assign);
router.post('/assets/:id/maintenance', requirePermissions('asset_maintenance'), assetController.scheduleMaintenance);
router.post('/assets/:id/dispose', requirePermissions('asset_dispose'), assetController.dispose);

// --- Phase 8: Visitor & Gate Pass Management ---
router.get('/visitors', requirePermissions('visitor_view'), visitorController.listVisitors);
router.post('/visitors/checkin', requirePermissions('visitor_checkin'), visitorController.checkIn);
router.patch('/visitors/:id/checkout', requirePermissions('visitor_checkin'), visitorController.checkOut);
router.get('/visitors/appointments', requirePermissions('visitor_view'), visitorController.listAppointments);
router.post('/visitors/appointments', requirePermissions('visitor_manage'), visitorController.createAppointment);
router.get('/gate-passes', requirePermissions('gate_pass_view'), visitorController.listGatePasses);
router.post('/gate-passes', requirePermissions('gate_pass_create'), visitorController.createGatePass);
router.patch('/gate-passes/:id/use', requirePermissions('gate_pass_use'), visitorController.useGatePass);

// ================================================================
// PHASE 9 — SAAS PLATFORM, SUBSCRIPTIONS, API KEYS, WEBHOOKS
// ================================================================
const planController = require('../controllers/planController');
const subscriptionController = require('../controllers/subscriptionController');
const apiKeyController = require('../controllers/apiKeyController');
const webhookController = require('../controllers/webhookController');

// --- Phase 9: Plans (public list, admin CRUD) ---
router.get('/platform/plans', planController.listPlans);
router.get('/platform/plans/:id', planController.getPlan);
router.post('/platform/plans', requirePermissions('plan_manage'), planController.createPlan);
router.put('/platform/plans/:id', requirePermissions('plan_manage'), planController.updatePlan);
router.delete('/platform/plans/:id', requirePermissions('plan_manage'), planController.deletePlan);

// --- Phase 9: Subscription (school-level) ---
router.get('/subscription', requirePermissions('subscription_view'), subscriptionController.getMySubscription);
router.get('/subscription/history', requirePermissions('subscription_view'), subscriptionController.getSubscriptionHistory);
router.get('/subscription/usage', requirePermissions('subscription_view'), subscriptionController.getUsage);
router.post('/subscription/activate', requirePermissions('subscription_manage'), subscriptionController.activate);
router.post('/subscription/cancel', requirePermissions('subscription_manage'), subscriptionController.cancel);
router.post('/subscription/change-plan', requirePermissions('subscription_manage'), subscriptionController.changePlan);

// --- Phase 9: Platform Admin Subscription Management ---
router.get('/platform/subscriptions', requirePermissions('platform_admin'), subscriptionController.listAll);
router.post('/platform/subscriptions/:schoolId/trial', requirePermissions('platform_admin'), subscriptionController.createTrialForSchool);
router.put('/platform/subscriptions/:id', requirePermissions('platform_admin'), subscriptionController.adminUpdateSubscription);

// --- Phase 9: API Keys ---
router.get('/api-keys', requirePermissions('api_key_view'), apiKeyController.list);
router.post('/api-keys', requirePermissions('api_key_manage'), apiKeyController.create);
router.delete('/api-keys/:id/revoke', requirePermissions('api_key_manage'), apiKeyController.revoke);

// --- Phase 9: Webhooks ---
router.get('/webhooks', requirePermissions('webhook_view'), webhookController.list);
router.post('/webhooks', requirePermissions('webhook_manage'), webhookController.create);
router.put('/webhooks/:id', requirePermissions('webhook_manage'), webhookController.update);
router.delete('/webhooks/:id', requirePermissions('webhook_manage'), webhookController.remove);
router.post('/webhooks/:id/test', requirePermissions('webhook_manage'), webhookController.test);
router.get('/webhooks/:id/deliveries', requirePermissions('webhook_view'), webhookController.deliveries);

// --- Phase 10: Mobile, PWA & Offline Synchronization ---
const syncController = require('../controllers/syncController');

router.post('/sync/mutations', syncController.syncMutations);
router.get('/sync/status', syncController.getSyncStatus);
router.post('/mobile/devices/register', syncController.registerDevice);
router.get('/mobile/devices', syncController.getDevices);
router.delete('/mobile/devices/:id', syncController.revokeDevice);
router.get('/mobile/dashboard', syncController.getMobileDashboard);
router.get('/mobile/config', syncController.getMobileConfig);

// --- Error Monitoring Module ---
router.get('/error-logs/stats', requirePermissions('audit_view'), errorLogController.getErrorLogStats);
router.get('/error-logs/group/:fingerprint', requirePermissions('audit_view'), errorLogController.getErrorLogGroup);
router.patch('/error-logs/group/:fingerprint/status', requirePermissions('audit_manage'), errorLogController.updateErrorLogGroupStatus);
router.get('/error-logs', requirePermissions('audit_view'), errorLogController.getErrorLogs);

module.exports = router;

