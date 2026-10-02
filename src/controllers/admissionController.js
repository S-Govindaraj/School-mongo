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
    const { search = '', status = '', gradeId = '', academicYearId = '', page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId, status: { $ne: 'ARCHIVED' } };
    if (status && status !== 'ALL') query.status = status;
    if (gradeId) query.gradeId = gradeId;
    if (academicYearId) query.academicYearId = academicYearId;

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

const bulkImportAdmissions = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { admissions = [], defaultGradeId, defaultAcademicYearId } = req.body;

    if (!Array.isArray(admissions) || admissions.length === 0) {
      throw new ValidationError('A non-empty "admissions" array is required.');
    }

    const [allGrades, allAcademicYears, existingApps] = await Promise.all([
      Grade.find({ schoolId }).lean(),
      AcademicYear.find({ schoolId }).lean(),
      Admission.find({ schoolId }, { applicationNumber: 1 }).lean(),
    ]);

    const activeAcademicYear = allAcademicYears.find((y) => y.isCurrent) || allAcademicYears[0];

    const gradeById = new Map();
    const gradeByNameOrCode = new Map();
    for (const g of allGrades) {
      gradeById.set(String(g._id), g);
      if (g.name) gradeByNameOrCode.set(g.name.toLowerCase().trim(), g);
      if (g.code) gradeByNameOrCode.set(g.code.toLowerCase().trim(), g);
    }

    const yearById = new Map();
    const yearByNameOrCode = new Map();
    for (const y of allAcademicYears) {
      yearById.set(String(y._id), y);
      if (y.name) yearByNameOrCode.set(y.name.toLowerCase().trim(), y);
      if (y.code) yearByNameOrCode.set(y.code.toLowerCase().trim(), y);
    }

    const existingAppNumbers = new Set(
      existingApps.map((a) => String(a.applicationNumber || '').trim().toLowerCase())
    );

    const sanitizeText = (val) => String(val || '').trim();
    const sanitizePhone = (val) => String(val || '').replace(/[^0-9]/g, '').trim();

    const results = {
      total: admissions.length,
      importedCount: 0,
      skippedCount: 0,
      errors: [],
      importedAdmissions: [],
    };

    for (let i = 0; i < admissions.length; i++) {
      const raw = admissions[i];
      const rowNum = i + 1;
      const rowErrors = [];

      const firstName = sanitizeText(raw.firstName);
      const middleName = sanitizeText(raw.middleName);
      const lastName = sanitizeText(raw.lastName);
      const rawDob = sanitizeText(raw.dob || raw.dateOfBirth);
      let gender = sanitizeText(raw.gender).toUpperCase();
      let bloodGroup = sanitizeText(raw.bloodGroup).toUpperCase();
      const nationality = sanitizeText(raw.nationality) || 'Indian';
      const email = sanitizeText(raw.email).toLowerCase();
      const phone = sanitizePhone(raw.phone);
      const previousSchool = sanitizeText(raw.previousSchool);
      const customAppNumber = sanitizeText(raw.applicationNumber);
      const notes = sanitizeText(raw.notes);

      const street = sanitizeText(raw.street || raw.address?.street);
      const city = sanitizeText(raw.city || raw.address?.city);
      const state = sanitizeText(raw.state || raw.address?.state);
      const postalCode = sanitizePhone(raw.postalCode || raw.address?.postalCode);
      const country = sanitizeText(raw.country || raw.address?.country) || 'India';

      const guardianName = sanitizeText(raw.guardianName);
      let guardianRelationship = sanitizeText(raw.guardianRelationship).toUpperCase() || 'FATHER';
      const guardianPhone = sanitizePhone(raw.guardianPhone);
      const guardianEmail = sanitizeText(raw.guardianEmail).toLowerCase();

      let status = sanitizeText(raw.status).toUpperCase();
      if (!['APPLICATION', 'UNDER_REVIEW', 'APPROVED', 'ADMITTED', 'REJECTED'].includes(status)) {
        status = 'APPLICATION';
      }

      // Validations
      if (!firstName) rowErrors.push('Student First Name is required');
      if (!lastName) rowErrors.push('Student Last Name is required');

      // Gender normalization
      if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
        if (gender === 'M' || gender === 'BOY') gender = 'MALE';
        else if (gender === 'F' || gender === 'GIRL') gender = 'FEMALE';
        else gender = 'MALE';
      }

      // Blood group normalization
      if (!['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'].includes(bloodGroup)) {
        bloodGroup = 'UNKNOWN';
      }

      // Guardian Relationship normalization
      if (!['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'].includes(guardianRelationship)) {
        guardianRelationship = 'FATHER';
      }

      // Guardian validations
      if (!guardianName) rowErrors.push('Guardian Name is required');
      if (!guardianPhone) {
        rowErrors.push('Guardian Phone is required');
      } else if (guardianPhone.length < 10) {
        rowErrors.push('Guardian Phone must be at least 10 digits');
      }

      // DOB
      let dobDate = null;
      if (!rawDob) {
        rowErrors.push('Date of Birth is required');
      } else {
        dobDate = new Date(rawDob);
        if (isNaN(dobDate.getTime())) {
          rowErrors.push('Invalid Date of Birth format');
        }
      }

      // Grade resolution
      let resolvedGradeId = defaultGradeId || null;
      const rawGrade = sanitizeText(raw.grade || raw.gradeId || raw.gradeName || raw.standard);
      if (rawGrade) {
        const foundGrade = gradeById.get(rawGrade) || gradeByNameOrCode.get(rawGrade.toLowerCase());
        if (foundGrade) {
          resolvedGradeId = foundGrade._id;
        } else {
          rowErrors.push(`Grade "${rawGrade}" not recognized in this school`);
        }
      } else if (!resolvedGradeId) {
        rowErrors.push('Grade / Class is required');
      }

      // Academic Year resolution
      let resolvedYearId = defaultAcademicYearId || activeAcademicYear?._id || null;
      const rawYear = sanitizeText(raw.academicYear || raw.academicYearId || raw.year);
      if (rawYear) {
        const foundYear = yearById.get(rawYear) || yearByNameOrCode.get(rawYear.toLowerCase());
        if (foundYear) {
          resolvedYearId = foundYear._id;
        } else {
          rowErrors.push(`Academic Year "${rawYear}" not recognized`);
        }
      } else if (!resolvedYearId) {
        rowErrors.push('Academic Year is required');
      }

      // Check duplicate application number
      if (customAppNumber && existingAppNumbers.has(customAppNumber.toLowerCase())) {
        rowErrors.push(`Application Number "${customAppNumber}" already exists`);
      }

      if (rowErrors.length > 0) {
        results.skippedCount++;
        results.errors.push({
          row: rowNum,
          name: `${firstName} ${lastName}`.trim() || `Row ${rowNum}`,
          errors: rowErrors,
        });
        continue;
      }

      // Generate Application Number
      const applicationNumber = customAppNumber || (await generateSequenceNumber(schoolId, 'ADMISSION'));
      if (customAppNumber) {
        existingAppNumbers.add(customAppNumber.toLowerCase());
      }

      const admission = await Admission.create({
        schoolId,
        applicationNumber,
        applicationDate: new Date(),
        academicYearId: resolvedYearId,
        gradeId: resolvedGradeId,
        studentData: {
          firstName,
          middleName,
          lastName,
          dob: dobDate,
          gender,
          bloodGroup,
          nationality,
          email,
          phone,
          address: {
            street,
            city,
            state,
            postalCode,
            country,
          },
          previousSchool,
        },
        guardianData: [
          {
            name: guardianName,
            relationship: guardianRelationship,
            phone: guardianPhone,
            email: guardianEmail,
            isPrimary: true,
            isEmergencyContact: true,
          },
        ],
        status,
        notes,
      });

      results.importedCount++;
      results.importedAdmissions.push(admission);
    }

    await logAuditEvent(req, 'BULK_IMPORT', 'ADMISSION', null, null, {
      total: results.total,
      importedCount: results.importedCount,
      skippedCount: results.skippedCount,
    });

    return successResponse(
      res,
      results,
      `Successfully imported ${results.importedCount} of ${results.total} admission application(s).`,
      200
    );
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
  bulkImportAdmissions,
};
