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
    .filter((l) => l.guardianId && l.guardianId.status === 'ACTIVE')
    .map((l) => ({
      ...l.guardianId,
      id: String(l.guardianId._id),
      relationship: l.relationship,
      isPrimary: l.isPrimary,
      isEmergencyContact: l.isEmergencyContact,
    }));
};

const getInactiveGuardianNames = async (schoolId, studentId) => {
  const links = await StudentGuardian.find({ schoolId, studentId }).populate('guardianId').lean();
  return new Set(
    links
      .filter((l) => l.guardianId && (l.guardianId.status === 'INACTIVE' || l.guardianId.status === 'ARCHIVED'))
      .map((l) => l.guardianId.name?.toLowerCase().trim())
      .filter(Boolean)
  );
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

const getAttendanceRecords = (schoolId, studentId, academicYearId) => {
  const query = { schoolId, studentId };
  if (academicYearId) query.academicYearId = academicYearId;
  return AttendanceRecord.find(query)
    .populate('statusId', 'name code countsAsPresent countsAsAbsent colorToken')
    .populate('periodId', 'name sequence')
    .sort({ date: -1 })
    .lean();
};

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

const getDocuments = async (schoolId, studentId) => {
  const docs = await Document.find({ schoolId, ownerType: 'STUDENT', ownerId: studentId, status: { $ne: 'ARCHIVED' } })
    .sort({ createdAt: -1 })
    .lean();
  return docs.map((doc) => ({
    ...doc,
    id: String(doc._id),
    fileType: doc.mimeType?.startsWith('image/') ? 'image' : (doc.mimeType === 'application/pdf' ? 'pdf' : 'document'),
    fileUrl: doc.fileUrl || `/api/v1/documents/${doc._id}/file`,
  }));
};

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

const getAllStandardsWithSectionsAndSubjects = async (schoolId, academicYearId, studentId = null) => {
  // If studentId is provided, filter strictly to the standards and sections assigned to this student
  if (studentId) {
    const [enrollments, histories] = await Promise.all([
      Enrollment.find({ schoolId, studentId, status: { $ne: 'ARCHIVED' } })
        .populate('gradeId')
        .populate({ path: 'sectionId', populate: { path: 'classTeacherId', select: 'firstName lastName employeeId email' } })
        .populate('academicYearId')
        .lean(),
      AcademicHistory.find({ schoolId, studentId })
        .populate('gradeId')
        .populate({ path: 'sectionId', populate: { path: 'classTeacherId', select: 'firstName lastName employeeId email' } })
        .populate('academicYearId')
        .lean(),
    ]);

    const gradeMap = new Map();
    const allRecords = [...enrollments, ...histories];

    allRecords.forEach((rec) => {
      const g = rec.gradeId;
      const s = rec.sectionId;
      if (!g || !g._id) return;
      const gid = String(g._id);
      if (!gradeMap.has(gid)) {
        gradeMap.set(gid, {
          grade: g,
          sectionsMap: new Map(),
        });
      }
      if (s && s._id) {
        const sid = String(s._id);
        const gEntry = gradeMap.get(gid);
        if (!gEntry.sectionsMap.has(sid)) {
          gEntry.sectionsMap.set(sid, {
            section: s,
            academicYearId: rec.academicYearId?._id || rec.academicYearId || academicYearId,
            academicYear: rec.academicYearId || null,
            status: rec.status || (rec.isCurrent ? 'ACTIVE' : 'COMPLETED'),
            isCurrent: rec.isCurrent || false,
          });
        }
      }
    });

    if (gradeMap.size > 0) {
      const grades = Array.from(gradeMap.values()).map((e) => e.grade);
      // Sort descending by sequenceOrder: "sorting desc stand"
      grades.sort((a, b) => (Number(b.sequenceOrder) || 0) - (Number(a.sequenceOrder) || 0));

      const results = [];
      for (const g of grades) {
        const gid = String(g._id);
        const gEntry = gradeMap.get(gid);
        const sections = [];

        for (const [sid, secData] of gEntry.sectionsMap.entries()) {
          const sec = secData.section;
          const yearId = secData.academicYearId || academicYearId;

          const [classSubs, teachers] = await Promise.all([
            ClassSubject.find({ schoolId, gradeId: g._id, academicYearId: yearId, status: 'ACTIVE' })
              .populate('subjectId', 'name code shortName type category')
              .sort({ sequenceOrder: 1 })
              .lean(),
            TeacherAssignment.find({ schoolId, gradeId: g._id, sectionId: sec._id, academicYearId: yearId, status: 'ACTIVE' })
              .populate('staffId', 'firstName lastName employeeId email')
              .populate('subjectId', 'name code shortName')
              .lean(),
          ]);

          const teachersBySub = {};
          teachers.forEach((ta) => {
            const subKey = String(ta.subjectId?._id || ta.subjectId);
            if (!teachersBySub[subKey]) teachersBySub[subKey] = [];
            teachersBySub[subKey].push({
              staff: ta.staffId,
              assignmentType: ta.assignmentType,
              isClassTeacher: ta.isClassTeacher,
            });
          });

          const sectionSubjects = classSubs.map((cs) => {
            const subKey = String(cs.subjectId?._id || cs.subjectId);
            const assigned = teachersBySub[subKey] || [];
            return {
              id: String(cs._id),
              subjectId: cs.subjectId,
              subjectName: cs.subjectId?.name || 'Subject',
              subjectCode: cs.subjectId?.code || '',
              weeklyPeriods: cs.weeklyPeriods || 0,
              isMandatory: cs.isMandatory,
              teachers: assigned,
              primaryTeacher: assigned[0]?.staff || null,
            };
          });

          const classTeacher = sec.classTeacherId ||
            teachers.find((ta) => String(ta.sectionId?._id || ta.sectionId) === String(sec._id) && ta.isClassTeacher)?.staffId ||
            null;
          const totalPeriods = sectionSubjects.reduce((sum, s) => sum + (s.weeklyPeriods || 0), 0);

          sections.push({
            id: String(sec._id),
            name: sec.name,
            code: sec.code,
            status: secData.isCurrent ? 'ACTIVE' : (secData.status || 'COMPLETED'),
            academicYear: secData.academicYear ? { id: String(secData.academicYear._id), name: secData.academicYear.name } : null,
            classTeacher,
            classTeacherName: classTeacher ? `${classTeacher.firstName || ''} ${classTeacher.lastName || ''}`.trim() : 'Not Assigned',
            subjectsCount: sectionSubjects.length,
            totalPeriodsPerWeek: totalPeriods,
            subjects: sectionSubjects,
          });
        }

        results.push({
          id: String(g._id),
          name: g.name,
          code: g.code,
          sequenceOrder: g.sequenceOrder,
          category: g.category,
          sectionCount: sections.length,
          sections,
        });
      }

      return results;
    }
  }

  // Fallback for school-wide view if studentId is not specified or no enrollments
  const [grades, sections, classSubjects, teacherAssignments] = await Promise.all([
    Grade.find({ schoolId, status: { $ne: 'ARCHIVED' } }).sort({ sequenceOrder: -1 }).lean(),
    Section.find({ schoolId, status: { $ne: 'ARCHIVED' } })
      .populate('classTeacherId', 'firstName lastName employeeId email')
      .sort({ name: 1 })
      .lean(),
    ClassSubject.find({ schoolId, academicYearId, status: 'ACTIVE' })
      .populate('subjectId', 'name code shortName type category')
      .sort({ sequenceOrder: 1 })
      .lean(),
    TeacherAssignment.find({ schoolId, academicYearId, status: 'ACTIVE' })
      .populate('staffId', 'firstName lastName employeeId email')
      .populate('subjectId', 'name code shortName')
      .lean(),
  ]);

  const subjectsByGrade = {};
  classSubjects.forEach((cs) => {
    const gid = String(cs.gradeId?._id || cs.gradeId);
    if (!subjectsByGrade[gid]) subjectsByGrade[gid] = [];
    subjectsByGrade[gid].push(cs);
  });

  const teachersBySectionAndSubject = {};
  teacherAssignments.forEach((ta) => {
    const secId = String(ta.sectionId?._id || ta.sectionId);
    const subId = String(ta.subjectId?._id || ta.subjectId);
    const key = `${secId}_${subId}`;
    if (!teachersBySectionAndSubject[key]) teachersBySectionAndSubject[key] = [];
    teachersBySectionAndSubject[key].push({
      staff: ta.staffId,
      assignmentType: ta.assignmentType,
      isClassTeacher: ta.isClassTeacher,
    });
  });

  const sectionsByGrade = {};
  sections.forEach((sec) => {
    const gid = String(sec.gradeId?._id || sec.gradeId);
    if (!sectionsByGrade[gid]) sectionsByGrade[gid] = [];

    const gradeSubs = subjectsByGrade[gid] || [];
    const sectionSubjects = gradeSubs.map((cs) => {
      const subId = String(cs.subjectId?._id || cs.subjectId);
      const assignedTeachers = teachersBySectionAndSubject[`${sec._id}_${subId}`] || [];
      return {
        id: String(cs._id),
        subjectId: cs.subjectId,
        subjectName: cs.subjectId?.name || 'Subject',
        subjectCode: cs.subjectId?.code || '',
        weeklyPeriods: cs.weeklyPeriods || 0,
        isMandatory: cs.isMandatory,
        teachers: assignedTeachers,
        primaryTeacher: assignedTeachers[0]?.staff || null,
      };
    });

    const totalPeriodsPerWeek = sectionSubjects.reduce((sum, s) => sum + (s.weeklyPeriods || 0), 0);

    const classTeacher = sec.classTeacherId ||
      teacherAssignments.find((ta) => String(ta.sectionId?._id || ta.sectionId) === String(sec._id) && ta.isClassTeacher)?.staffId ||
      null;

    sectionsByGrade[gid].push({
      id: String(sec._id),
      name: sec.name,
      code: sec.code,
      status: sec.status || 'ACTIVE',
      classTeacher,
      classTeacherName: classTeacher ? `${classTeacher.firstName || ''} ${classTeacher.lastName || ''}`.trim() : 'Not Assigned',
      subjectsCount: sectionSubjects.length,
      totalPeriodsPerWeek,
      subjects: sectionSubjects,
    });
  });

  return grades.map((g) => ({
    id: String(g._id),
    name: g.name,
    code: g.code,
    sequenceOrder: g.sequenceOrder,
    category: g.category,
    sections: sectionsByGrade[String(g._id)] || [],
    sectionCount: (sectionsByGrade[String(g._id)] || []).length,
  }));
};

module.exports = {
  findStudentInSchool,
  resolveAcademicYear,
  getCurrentEnrollment,
  getEnrollmentForYear,
  getAllEnrollments,
  getAcademicHistory,
  getGuardians,
  getInactiveGuardianNames,
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
  getAllStandardsWithSectionsAndSubjects,
};
