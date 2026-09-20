const Admission = require('../models/Admission');
const Student = require('../models/Student');
const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const AcademicYear = require('../models/AcademicYear');
const Grade = require('../models/Grade');
const { generateSequenceNumber } = require('../utils/sequenceUtils');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getAdmissions = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { search = '', status = '', gradeId = '', page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId, status: { $ne: 'ARCHIVED' } };
    if (status && status !== 'ALL') query.status = status;
    if (gradeId) query.gradeId = gradeId;

    if (search.trim()) {
      const s = String(search).trim();
      query.$or = [
        { applicationNumber: { $regex: s, $options: 'i' } },
        { 'studentData.firstName': { $regex: s, $options: 'i' } },
        { 'studentData.lastName': { $regex: s, $options: 'i' } },
        { 'studentData.phone': { $regex: s, $options: 'i' } },
      ];
    }

    const [totalRecords, admissions, totalApps, underReview, approved, admitted] = await Promise.all([
      Admission.countDocuments(query),
      Admission.find(query)
        .populate('academicYearId', 'name code')
        .populate('gradeId', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Admission.countDocuments({ schoolId, status: 'APPLICATION' }),
      Admission.countDocuments({ schoolId, status: 'UNDER_REVIEW' }),
      Admission.countDocuments({ schoolId, status: 'APPROVED' }),
      Admission.countDocuments({ schoolId, status: 'ADMITTED' }),
    ]);

    const formattedAdmissions = admissions.map((adm) => ({
      ...adm,
      id: String(adm._id),
    }));

    const kpis = {
      totalApplications: totalRecords,
      pendingReview: totalApps + underReview,
      approved,
      admitted,
    };

    return res.status(200).json({
      success: true,
      data: formattedAdmissions,
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

const getAdmissionById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const admission = await Admission.findOne({ _id: id, schoolId })
      .populate('academicYearId', 'name code')
      .populate('gradeId', 'name code')
      .lean();

    if (!admission) throw new NotFoundError('Admission application not found');

    return successResponse(res, { ...admission, id: String(admission._id) }, 'Admission application retrieved');
  } catch (error) {
    next(error);
  }
};

const createAdmission = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, gradeId, studentData, guardianData, notes } = req.body;

    // Validate academic year and grade belong to school
    const [year, grade] = await Promise.all([
      AcademicYear.findOne({ _id: academicYearId, schoolId }),
      Grade.findOne({ _id: gradeId, schoolId }),
    ]);

    if (!year) throw new ValidationError('Invalid Academic Year');
    if (!grade) throw new ValidationError('Invalid Grade');

    const applicationNumber = await generateSequenceNumber(schoolId, 'ADMISSION');

    const admission = await Admission.create({
      schoolId,
      applicationNumber,
      academicYearId,
      gradeId,
      studentData,
      guardianData,
      notes,
      status: 'APPLICATION',
    });

    await logAuditEvent(req, 'CREATE', 'ADMISSION', admission._id, null, admission);
    return successResponse(res, admission, 'Admission application submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateAdmissionStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const { status, rejectionReason, notes } = req.body;

    const admission = await Admission.findOne({ _id: id, schoolId });
    if (!admission) throw new NotFoundError('Admission application not found');

    admission.status = status;
    if (notes) admission.notes = notes;
    if (status === 'APPROVED') {
      admission.approvedBy = userId;
      admission.approvalDate = new Date();
    }
    if (status === 'REJECTED') {
      admission.rejectionReason = rejectionReason || 'Application rejected';
    }

    await admission.save();

    await logAuditEvent(req, 'STATUS_CHANGE', 'ADMISSION', id, null, { status, rejectionReason });
    return successResponse(res, admission, `Admission application status updated to ${status}`);
  } catch (error) {
    next(error);
  }
};

const admitStudent = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const admission = await Admission.findOne({ _id: id, schoolId });
    if (!admission) throw new NotFoundError('Admission application not found');
    if (admission.status !== 'APPROVED' && admission.status !== 'ADMITTED') {
      throw new ValidationError('Admission application must be APPROVED before student can be admitted');
    }

    if (admission.studentId) {
      const existingStudent = await Student.findOne({ _id: admission.studentId, schoolId });
      if (existingStudent) {
        return successResponse(res, existingStudent, 'Student is already admitted');
      }
    }

    const studentNumber = await generateSequenceNumber(schoolId, 'STUDENT');

    const student = await Student.create({
      schoolId,
      studentNumber,
      admissionNumber: admission.applicationNumber,
      firstName: admission.studentData.firstName,
      middleName: admission.studentData.middleName,
      lastName: admission.studentData.lastName,
      dob: admission.studentData.dob,
      gender: admission.studentData.gender,
      bloodGroup: admission.studentData.bloodGroup || 'UNKNOWN',
      nationality: admission.studentData.nationality || 'Indian',
      email: admission.studentData.email,
      phone: admission.studentData.phone,
      address: admission.studentData.address,
      previousSchool: admission.studentData.previousSchool,
      status: 'ADMITTED',
    });

    // Create & link guardians in parallel (eliminates sequential findOne+create per guardian)
    if (admission.guardianData && admission.guardianData.length > 0) {
      await Promise.all(admission.guardianData.map(async (gData) => {
        let guardian = await Guardian.findOne({ schoolId, phone: gData.phone, status: 'ACTIVE' });
        if (!guardian) {
          guardian = await Guardian.create({
            schoolId,
            name: gData.name,
            relationship: gData.relationship,
            phone: gData.phone,
            email: gData.email,
            occupation: gData.occupation,
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

    admission.status = 'ADMITTED';
    admission.studentId = student._id;
    await admission.save();

    await logAuditEvent(req, 'ADMIT', 'ADMISSION', id, null, { studentId: student._id });
    return successResponse(res, student, 'Student profile created and admitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdmissions,
  getAdmissionById,
  createAdmission,
  updateAdmissionStatus,
  admitStudent,
};
