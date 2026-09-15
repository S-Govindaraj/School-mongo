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

const getStudents = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const {
      search = '',
      status = '',
      gradeId = '',
      sectionId = '',
      academicYearId = '',
      page = 1,
      limit = 50,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const query = { schoolId, status: { $ne: 'ARCHIVED' } };

    if (status && status !== 'ALL') {
      query.status = status;
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

    // Filter by academic placement via Enrollment if gradeId, sectionId or academicYearId provided
    if (gradeId || sectionId || academicYearId) {
      const enrollQuery = { schoolId, isCurrent: true };
      if (gradeId) enrollQuery.gradeId = gradeId;
      if (sectionId) enrollQuery.sectionId = sectionId;
      if (academicYearId) enrollQuery.academicYearId = academicYearId;

      const matchingEnrollments = await Enrollment.find(enrollQuery).select('studentId');
      const studentIds = matchingEnrollments.map((e) => e.studentId);
      query._id = { $in: studentIds };
    }

    const [totalRecords, students, currentEnrollments, totalApplicants, totalActive, totalAdmitted] = await Promise.all([
      Student.countDocuments(query),
      Student.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Enrollment.find({ schoolId, isCurrent: true })
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .populate('academicYearId', 'name code')
        .lean(),
      Student.countDocuments({ schoolId, status: 'APPLICANT' }),
      Student.countDocuments({ schoolId, status: 'ACTIVE' }),
      Student.countDocuments({ schoolId, status: 'ADMITTED' }),
    ]);

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
              grade: placement.gradeId?.name,
              section: placement.sectionId?.name,
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
        limit: limitNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum) || 1,
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

    const student = await Student.findOne({ _id: id, schoolId }).lean();
    if (!student) {
      throw new NotFoundError('Student profile not found');
    }

    const [guardiansLinks, enrollments, documents, academicHistory, auditLogs] = await Promise.all([
      StudentGuardian.find({ schoolId, studentId: id })
        .populate('guardianId')
        .lean(),
      Enrollment.find({ schoolId, studentId: id })
        .populate('academicYearId', 'name code')
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .sort({ createdAt: -1 })
        .lean(),
      StudentDocument.find({ schoolId, studentId: id, status: 'ACTIVE' }).lean(),
      AcademicHistory.find({ schoolId, studentId: id })
        .populate('academicYearId', 'name')
        .populate('gradeId', 'name')
        .populate('sectionId', 'name')
        .lean(),
      AuditLog.find({ schoolId, entityId: String(id) })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean(),
    ]);

    const guardians = guardiansLinks.map((g) => ({
      ...g.guardianId,
      id: String(g.guardianId?._id || ''),
      relationship: g.relationship,
      isPrimary: g.isPrimary,
      isEmergencyContact: g.isEmergencyContact,
    }));

    const profile360 = {
      ...student,
      id: String(student._id),
      guardians,
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

    // Create & link guardians if provided
    if (guardians.length > 0) {
      for (const gData of guardians) {
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
      }
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

    student.status = 'ARCHIVED';
    await student.save();

    await logAuditEvent(req, 'ARCHIVE', 'STUDENT', id, null, { status: 'ARCHIVED' });
    return successResponse(res, null, 'Student archived successfully');
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
};
