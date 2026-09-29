const mongoose = require('mongoose');
const Student = require('../models/Student');
const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const Enrollment = require('../models/Enrollment');
const StudentDocument = require('../models/StudentDocument');
const AcademicHistory = require('../models/AcademicHistory');
const AuditLog = require('../models/AuditLog');
const { generateSequenceNumber } = require('../utils/sequenceUtils');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { narrowEnrollmentFilter, isEnrollmentAllowed } = require('../services/staffAccessScopeService');

// Staff In-Charge / Class Teacher guard for single-record student endpoints —
// throws the same NotFoundError a wrong-schoolId lookup already throws, so an
// out-of-scope record is indistinguishable from a nonexistent one (no
// existence-leak via a different error/status code).
async function assertStudentInScope(req, schoolId, studentId) {
  const scope = req.staffAccessScope;
  if (!scope || scope.mode === 'ALL') return;
  const currentEnrollment = await Enrollment.findOne({ schoolId, studentId, isCurrent: true }).lean();
  if (!isEnrollmentAllowed(scope, currentEnrollment)) {
    throw new NotFoundError('Student record not found');
  }
}

const getStudents = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const {
      search = '',
      status = '',
      includeArchived,
      gradeId = '',
      sectionId = '',
      academicYearId = '',
      page = 1,
      limit = 50,
      sortBy = 'studentNumber',
      sortOrder = 'asc',
    } = req.query;

    const isAll = limit === 'all' || limit === '-1' || limit === '0' || parseInt(limit, 10) === 0;
    const pageNum = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10);
    const limitNum = isAll ? 0 : (isNaN(parsedLimit) ? 50 : Math.max(1, parsedLimit));
    const skip = isAll ? 0 : (pageNum - 1) * limitNum;

    // Build filter
    const query = { schoolId };

    if (status && status !== 'ALL') {
      query.status = status;
    } else if (includeArchived === 'false') {
      query.status = { $ne: 'ARCHIVED' };
    }

    if (search.trim()) {
      const s = String(search).trim();
      query.$or = [
        { studentNumber: { $regex: s, $options: 'i' } },
        { admissionNumber: { $regex: s, $options: 'i' } },
        { firstName: { $regex: s, $options: 'i' } },
        { lastName: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
      ];
    }

    // Staff In-Charge / Class Teacher scoping — applies whenever the caller
    // isn't in an 'ALL'-mode scope, regardless of whether they also passed
    // their own gradeId/sectionId/academicYearId params (those are narrowed
    // further, never used to escape the scope).
    const scope = req.staffAccessScope;
    const needsEnrollmentFilter = !!(gradeId || sectionId || academicYearId) || (scope && scope.mode !== 'ALL');

    // Phase 1: enrollment pre-filter (if needed)
    const enrollFilterQuery = needsEnrollmentFilter ? (() => {
      const q = { schoolId, isCurrent: true };
      if (gradeId) q.gradeId = gradeId;
      if (sectionId) q.sectionId = sectionId;
      if (academicYearId) q.academicYearId = academicYearId;
      narrowEnrollmentFilter(q, scope);
      return q;
    })() : null;

    const matchingEnrollments = enrollFilterQuery
      ? await Enrollment.find(enrollFilterQuery).select('studentId').lean()
      : null;

    if (matchingEnrollments) {
      query._id = { $in: matchingEnrollments.map((e) => e.studentId) };
    }

    // KPI counts must respect the same scope as the list itself (but keep
    // their existing school-wide-by-status semantics otherwise — they never
    // factored in the caller's own search/status params, and still don't;
    // only the scope-narrowed `_id` set is layered on top).
    const kpiScopeFilter = query._id ? { _id: query._id } : {};
    const [totalApplicants, totalActive, totalAdmitted] = await Promise.all([
      Student.countDocuments({ schoolId, ...kpiScopeFilter, status: 'APPLICANT' }),
      Student.countDocuments({ schoolId, ...kpiScopeFilter, status: 'ACTIVE' }),
      Student.countDocuments({ schoolId, ...kpiScopeFilter, status: 'ADMITTED' }),
    ]);

    // Phase 2: paginated student list + total count in parallel
    const sortDir = String(sortOrder).toLowerCase() === 'desc' ? -1 : 1;
    const sortField = sortBy || 'studentNumber';
    const sortOption = { [sortField]: sortDir };
    if (sortField !== '_id') {
      sortOption._id = 1;
    }

    let studentFindQuery = Student.find(query).sort(sortOption);
    if (!isAll && skip > 0) {
      studentFindQuery = studentFindQuery.skip(skip);
    }
    if (!isAll && limitNum > 0) {
      studentFindQuery = studentFindQuery.limit(limitNum);
    }

    const [totalRecords, students] = await Promise.all([
      Student.countDocuments(query),
      studentFindQuery.lean(),
    ]);

    // Phase 3: fetch enrollments only for the current page of students (not all students school-wide)
    const pageStudentIds = students.map((s) => s._id);
    const currentEnrollments = await Enrollment.find({ schoolId, isCurrent: true, studentId: { $in: pageStudentIds } })
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code')
      .populate('academicYearId', 'name code')
      .lean();

    // Attach active enrollment placement to each student
    const enrollmentMap = {};
    currentEnrollments.forEach((e) => {
      enrollmentMap[String(e.studentId)] = e;
    });

    const formattedStudents = students.map((stu) => {
      const placement = enrollmentMap[String(stu._id)];
      return {
        ...stu,
        id: String(stu._id),
        currentEnrollment: placement
          ? {
              academicYear: placement.academicYearId?.name,
              academicYearId: placement.academicYearId?._id || placement.academicYearId,
              grade: placement.gradeId?.name,
              gradeId: placement.gradeId?._id || placement.gradeId,
              section: placement.sectionId?.name,
              sectionId: placement.sectionId?._id || placement.sectionId,
              rollNumber: placement.rollNumber || stu.rollNumber || '',
            }
          : null,
      };
    });

    const kpis = {
      totalStudents: totalRecords,
      activeStudents: totalActive,
      newAdmissions: totalAdmitted,
      applicants: totalApplicants,
    };

    return res.status(200).json({
      success: true,
      data: formattedStudents,
      pagination: {
        page: pageNum,
        limit: limitNum || totalRecords,
        totalRecords,
        totalPages: limitNum > 0 ? (Math.ceil(totalRecords / limitNum) || 1) : 1,
      },
      kpis,
    });
  } catch (error) {
    next(error);
  }
};

const getStudent360 = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
    const student = isObjectId
      ? await Student.findOne({ _id: id, schoolId }).lean()
      : await Student.findOne({ schoolId, $or: [{ studentNumber: id }, { admissionNumber: id }] }).lean();

    if (!student) {
      throw new NotFoundError('Student profile not found');
    }

    const resolvedStudentId = student._id;
    await assertStudentInScope(req, schoolId, resolvedStudentId);

    const [guardiansLinks, enrollments, documents, academicHistory, auditLogs] = await Promise.all([
      StudentGuardian.find({ schoolId, studentId: resolvedStudentId })
        .populate('guardianId')
        .lean(),
      Enrollment.find({ schoolId, studentId: resolvedStudentId })
        .populate('academicYearId', 'name code')
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .sort({ createdAt: -1 })
        .lean(),
      StudentDocument.find({ schoolId, studentId: resolvedStudentId, status: 'ACTIVE' }).lean(),
      AcademicHistory.find({ schoolId, studentId: resolvedStudentId })
        .populate('academicYearId', 'name')
        .populate('gradeId', 'name')
        .populate('sectionId', 'name')
        .lean(),
      AuditLog.find({ schoolId, entityId: String(resolvedStudentId) })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean(),
    ]);

    const activeGuardians = guardiansLinks
      .filter((g) => g.guardianId && g.guardianId.status === 'ACTIVE')
      .map((g) => ({
        ...g.guardianId,
        id: String(g.guardianId?._id || ''),
        relationship: g.relationship,
        isPrimary: g.isPrimary,
        isEmergencyContact: g.isEmergencyContact,
      }));

    const inactiveGuardianNames = new Set(
      guardiansLinks
        .filter((g) => g.guardianId && (g.guardianId.status === 'INACTIVE' || g.guardianId.status === 'ARCHIVED'))
        .map((g) => g.guardianId.name?.toLowerCase().trim())
        .filter(Boolean)
    );

    let sanitizedEmergency = student.emergencyContact ? { ...student.emergencyContact } : null;
    if (sanitizedEmergency?.name && inactiveGuardianNames.has(sanitizedEmergency.name.toLowerCase().trim())) {
      sanitizedEmergency = null;
    }

    const profile360 = {
      ...student,
      id: String(student._id),
      emergencyContact: sanitizedEmergency,
      guardians: activeGuardians,
      enrollments: enrollments.map((e) => ({ ...e, id: String(e._id) })),
      documents: documents.map((d) => ({ ...d, id: String(d._id) })),
      academicHistory: academicHistory.map((h) => ({ ...h, id: String(h._id) })),
      timeline: auditLogs,
    };

    return successResponse(res, profile360, 'Student 360 profile retrieved');
  } catch (error) {
    next(error);
  }
};

const createStudent = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const {
      firstName,
      middleName,
      lastName,
      dob,
      gender,
      bloodGroup,
      nationality,
      email,
      phone,
      address,
      previousSchool,
      emergencyContact,
      guardians = [],
    } = req.body;

    const studentNumber = await generateSequenceNumber(schoolId, 'STUDENT');
    const admissionNumber = await generateSequenceNumber(schoolId, 'ADMISSION');

    const student = await Student.create({
      schoolId,
      studentNumber,
      admissionNumber,
      firstName,
      middleName,
      lastName,
      dob,
      gender,
      bloodGroup,
      nationality,
      email,
      phone,
      address,
      previousSchool,
      emergencyContact,
      status: 'ADMITTED',
    });

    // Create & link guardians in parallel (eliminates sequential findOne+create per guardian)
    if (guardians.length > 0) {
      await Promise.all(guardians.map(async (gData) => {
        let guardian = await Guardian.findOne({ schoolId, phone: gData.phone, status: 'ACTIVE' });
        if (!guardian) {
          guardian = await Guardian.create({
            schoolId,
            name: gData.name,
            relationship: gData.relationship,
            phone: gData.phone,
            email: gData.email,
            occupation: gData.occupation,
            address: gData.address || address?.street || '',
            isPrimary: gData.isPrimary || false,
            isEmergencyContact: gData.isEmergencyContact || false,
          });
        }
        await StudentGuardian.create({
          schoolId,
          studentId: student._id,
          guardianId: guardian._id,
          relationship: gData.relationship,
          isPrimary: gData.isPrimary || false,
          isEmergencyContact: gData.isEmergencyContact || false,
        });
      }));
    }

    await logAuditEvent(req, 'CREATE', 'STUDENT', student._id, null, student);
    return successResponse(res, student, 'Student master created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateStudent = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, schoolId });
    if (!student) {
      throw new NotFoundError('Student record not found');
    }
    await assertStudentInScope(req, schoolId, id);

    const previousState = student.toObject();
    Object.assign(student, req.body);
    await student.save();

    await logAuditEvent(req, 'UPDATE', 'STUDENT', id, previousState, student);
    return successResponse(res, student, 'Student updated successfully');
  } catch (error) {
    next(error);
  }
};

const updateStudentStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const { status, reason } = req.body;

    const student = await Student.findOne({ _id: id, schoolId });
    if (!student) {
      throw new NotFoundError('Student record not found');
    }
    await assertStudentInScope(req, schoolId, id);

    const previousStatus = student.status;
    student.status = status;
    await student.save();

    await logAuditEvent(req, 'STATUS_CHANGE', 'STUDENT', id, { status: previousStatus }, { status, reason });
    return successResponse(res, student, `Student status changed to ${status}`);
  } catch (error) {
    next(error);
  }
};

const deleteStudent = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, schoolId });
    if (!student) {
      throw new NotFoundError('Student record not found');
    }
    await assertStudentInScope(req, schoolId, id);

    student.status = 'INACTIVE';
    await student.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'Student',
      entityId: id,
      newValues: { status: 'INACTIVE' },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, null, 'Student deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restoreStudent = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, schoolId });
    if (!student) {
      throw new NotFoundError('Student record not found');
    }
    await assertStudentInScope(req, schoolId, id);

    const oldValues = student.toObject();
    student.status = 'ACTIVE';
    await student.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'Student',
      entityId: id,
      oldValues,
      newValues: student.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, student, 'Student activated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStudents,
  getStudent360,
  getStudentById: getStudent360,
  createStudent,
  updateStudent,
  updateStudentStatus,
  deleteStudent,
  restoreStudent,
};
