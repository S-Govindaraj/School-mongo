const Student = require('../models/Student');
const StudentGuardian = require('../models/StudentGuardian');
const Enrollment = require('../models/Enrollment');
const AcademicHistory = require('../models/AcademicHistory');
const AcademicYear = require('../models/AcademicYear');
const AttendanceRecord = require('../models/AttendanceRecord');
const ExamResult = require('../models/ExamResult');
const Invoice = require('../models/Invoice');
const FeeConcession = require('../models/FeeConcession');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const Timetable = require('../models/Timetable');
const Document = require('../models/Document');
const TransportAssignment = require('../models/TransportAssignment');
const AuditLog = require('../models/AuditLog');
const StudentHealthProfile = require('../models/StudentHealthProfile');
const MedicalVisit = require('../models/MedicalVisit');
const DisciplineIncident = require('../models/DisciplineIncident');
const DisciplinaryAction = require('../models/DisciplinaryAction');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const Staff = require('../models/Staff');
const AttendanceStatus = require('../models/AttendanceStatus');
const Period = require('../models/Period');
const Guardian = require('../models/Guardian');
const Subject = require('../models/Subject');
const AcademicTerm = require('../models/AcademicTerm');
const Room = require('../models/Room');
const TransportRoute = require('../models/TransportRoute');
const RouteStop = require('../models/RouteStop');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');

const mongoose = require('mongoose');

const findStudentInSchool = (schoolId, studentId) => {
  if (!studentId) return Promise.resolve(null);
  const isObjectId = mongoose.Types.ObjectId.isValid(studentId) && String(new mongoose.Types.ObjectId(studentId)) === String(studentId);
  if (isObjectId) {
    return Student.findOne({ _id: studentId, schoolId }).lean();
  }
  return Student.findOne({
    schoolId,
    $or: [{ studentNumber: studentId }, { admissionNumber: studentId }],
  }).lean();
};

const resolveAcademicYear = async (schoolId, academicYearId) => {
  if (academicYearId) return academicYearId;
  const activeAY = await AcademicYear.findOne({ schoolId, isCurrent: true, status: 'ACTIVE' }).lean();
  return activeAY?._id || null;
};

const getCurrentEnrollment = (schoolId, studentId) =>
  Enrollment.findOne({ schoolId, studentId, isCurrent: true })
    .populate('academicYearId', 'name code isCurrent')
    .populate('gradeId', 'name code')
    .populate('sectionId', 'name code')
    .lean();

const getEnrollmentForYear = (schoolId, studentId, academicYearId) =>
  Enrollment.findOne({ schoolId, studentId, academicYearId })
    .populate('academicYearId', 'name code isCurrent')
    .populate('gradeId', 'name code')
    .populate('sectionId', 'name code')
    .lean();

const getAllEnrollments = (schoolId, studentId) =>
  Enrollment.find({ schoolId, studentId })
    .populate('academicYearId', 'name code isCurrent')
    .populate('gradeId', 'name code')
    .populate('sectionId', 'name code')
    .sort({ createdAt: -1 })
    .lean();

const getAcademicHistory = (schoolId, studentId) =>
  AcademicHistory.find({ schoolId, studentId })
    .populate('academicYearId', 'name code')
    .populate('gradeId', 'name code')
    .populate('sectionId', 'name code')
    .sort({ createdAt: -1 })
    .lean();

const getGuardians = async (schoolId, studentId) => {
  const links = await StudentGuardian.find({ schoolId, studentId }).populate('guardianId').lean();
  return links
    .filter((l) => l.guardianId)
    .map((l) => ({
      ...l.guardianId,
      id: String(l.guardianId._id),
      relationship: l.relationship,
      isPrimary: l.isPrimary,
      isEmergencyContact: l.isEmergencyContact,
    }));
};

const getClassTeacher = async (schoolId, academicYearId, gradeId, sectionId) => {
  if (!sectionId) return null;
  // 1. Direct Section.classTeacherId lookup (Single Source of Truth)
  const section = await Section.findOne({ _id: sectionId, schoolId })
    .populate('classTeacherId', 'firstName lastName employeeId email phone qualification designation')
    .lean();
  if (section?.classTeacherId) return section.classTeacherId;

  // 2. Legacy fallback to TeacherAssignment
  if (academicYearId && gradeId) {
    const assignment = await TeacherAssignment.findOne({
      schoolId, academicYearId, gradeId, sectionId, isClassTeacher: true, status: 'ACTIVE',
    }).populate('staffId', 'firstName lastName employeeId email phone qualification designation').lean();
    return assignment?.staffId || null;
  }
  return null;
};

const getAttendanceRecords = (schoolId, studentId, academicYearId) =>
  AttendanceRecord.find({ schoolId, studentId, academicYearId })
    .populate('statusId', 'name code countsAsPresent countsAsAbsent colorToken')
    .populate('periodId', 'name sequence')
    .sort({ date: -1 })
    .lean();

const getExamResults = (schoolId, studentId, academicYearId) => {
  const query = { schoolId, studentId };
  if (academicYearId) query.academicYearId = academicYearId;
  return ExamResult.find(query)
    .populate('subjectId', 'name code shortName')
    .populate('academicYearId', 'name code')
    .populate('academicTermId', 'name code')
    .sort({ publishedAt: -1 })
    .lean();
};

const getExamResultsAllYears = (schoolId, studentId) =>
  ExamResult.find({ schoolId, studentId, status: 'PUBLISHED' })
    .populate('academicYearId', 'name code')
    .lean();

const getInvoices = (schoolId, studentId, academicYearId) => {
  const query = { schoolId, studentId };
  if (academicYearId) query.academicYearId = academicYearId;
  return Invoice.find(query)
    .populate('academicYearId', 'name code')
    .sort({ invoiceDate: -1 })
    .lean();
};

const getConcessions = (schoolId, studentId, academicYearId) => {
  const query = { schoolId, studentId };
  if (academicYearId) query.academicYearId = academicYearId;
  return FeeConcession.find(query).sort({ createdAt: -1 }).lean();
};

const getClassSubjects = (schoolId, academicYearId, gradeId) =>
  ClassSubject.find({ schoolId, academicYearId, gradeId, status: 'ACTIVE' })
    .populate('subjectId', 'name code shortName')
    .lean();

const getTeacherAssignmentsForSection = (schoolId, academicYearId, gradeId, sectionId) =>
  TeacherAssignment.find({ schoolId, academicYearId, gradeId, sectionId, status: 'ACTIVE' })
    .populate('staffId', 'firstName lastName employeeId')
    .populate('subjectId', 'name code shortName')
    .lean();

const getSectionTimetable = (schoolId, academicYearId, sectionId) =>
  Timetable.find({ schoolId, academicYearId, sectionId, status: { $ne: 'ARCHIVED' } })
    .populate('periodId', 'name code sequence startTime endTime isBreak')
    .populate('subjectId', 'name code shortName')
    .populate('teacherId', 'firstName lastName employeeId')
    .populate('roomId', 'name')
    .lean();

const getDocuments = (schoolId, studentId) =>
  Document.find({ schoolId, ownerType: 'STUDENT', ownerId: studentId })
    .sort({ createdAt: -1 })
    .lean();

const countPendingDocuments = (schoolId, studentId) =>
  Document.countDocuments({ schoolId, ownerType: 'STUDENT', ownerId: studentId, status: 'PENDING_VERIFICATION' });

const getTransportAssignment = (schoolId, studentId, academicYearId) => {
  const query = { schoolId, studentId };
  if (academicYearId) query.academicYearId = academicYearId;
  return TransportAssignment.find(query)
    .populate('routeId', 'routeCode routeName direction')
    .populate('routeStopId', 'stopName sequence estimatedArrivalTime estimatedDepartureTime')
    .populate('vehicleId', 'vehicleNumber registrationNumber vehicleType')
    .sort({ effectiveFrom: -1 })
    .lean();
};

const getTimeline = (schoolId, studentId, limit = 50) =>
  AuditLog.find({ schoolId, entityId: String(studentId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

const getDisciplineIncidents = (schoolId, studentId) =>
  DisciplineIncident.find({ schoolId, studentId })
    .populate('reportedBy', 'firstName lastName employeeId')
    .sort({ date: -1 })
    .lean();

const getDisciplinaryActionsForIncidents = (schoolId, incidentIds) =>
  DisciplinaryAction.find({ schoolId, incidentId: { $in: incidentIds } })
    .populate('approvedBy', 'name email')
    .sort({ actionDate: -1 })
    .lean();

const getHealthProfile = (schoolId, studentId) =>
  StudentHealthProfile.findOne({ schoolId, studentId }).lean();

const getMedicalVisits = (schoolId, studentId) =>
  MedicalVisit.find({ schoolId, studentId })
    .populate('recordedBy', 'name email')
    .sort({ visitDate: -1 })
    .lean();

module.exports = {
  findStudentInSchool,
  resolveAcademicYear,
  getCurrentEnrollment,
  getEnrollmentForYear,
  getAllEnrollments,
  getAcademicHistory,
  getGuardians,
  getClassTeacher,
  getAttendanceRecords,
  getExamResults,
  getExamResultsAllYears,
  getInvoices,
  getConcessions,
  getClassSubjects,
  getTeacherAssignmentsForSection,
  getSectionTimetable,
  getDocuments,
  countPendingDocuments,
  getTransportAssignment,
  getTimeline,
  getDisciplineIncidents,
  getDisciplinaryActionsForIncidents,
  getHealthProfile,
  getMedicalVisits,
};
