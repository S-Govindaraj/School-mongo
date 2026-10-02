const mongoose = require('mongoose');
const Student = require('../models/Student');
const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const Enrollment = require('../models/Enrollment');
const StudentDocument = require('../models/StudentDocument');
const AcademicHistory = require('../models/AcademicHistory');
const AuditLog = require('../models/AuditLog');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const AcademicYear = require('../models/AcademicYear');
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

const bulkImportStudents = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const {
      students = [],
      defaultAcademicYearId = '',
      defaultGradeId = '',
      defaultSectionId = '',
    } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      throw new ValidationError('No student records provided for bulk import');
    }

    if (students.length > 500) {
      throw new ValidationError('Maximum 500 student records can be imported in a single batch');
    }

    // Sanitize string helpers: clean extra spaces
    const sanitizeText = (val) => {
      if (val === undefined || val === null) return '';
      return String(val).trim().replace(/\s+/g, ' ');
    };

    const sanitizePhone = (val) => {
      if (!val) return '';
      return String(val).replace(/[\s\-\(\)\+]/g, '').trim();
    };

    // Pre-extract unique admission numbers and guardian phones from batch
    const customAdmissionNumbers = [];
    const guardianPhones = [];
    for (let i = 0; i < students.length; i++) {
      const raw = students[i];
      const adm = sanitizeText(raw?.admissionNumber);
      if (adm) customAdmissionNumbers.push(adm);
      const gPhone = sanitizePhone(raw?.guardianPhone);
      if (gPhone) guardianPhones.push(gPhone);
    }
    const uniqueCustomAdmissions = Array.from(new Set(customAdmissionNumbers));
    const uniqueGuardianPhones = Array.from(new Set(guardianPhones));

    // Pre-load all grades, sections, academic years, matching existing admission numbers, and existing active guardians
    const [allGrades, allSections, allAcademicYears, existingStudentsWithAdmission, existingGuardians] = await Promise.all([
      Grade.find({ schoolId }).lean(),
      Section.find({ schoolId }).lean(),
      AcademicYear.find({ schoolId }).lean(),
      uniqueCustomAdmissions.length > 0
        ? Student.find({ schoolId, admissionNumber: { $in: uniqueCustomAdmissions } }, { admissionNumber: 1 }).lean()
        : [],
      uniqueGuardianPhones.length > 0
        ? Guardian.find({ schoolId, phone: { $in: uniqueGuardianPhones }, status: 'ACTIVE' })
        : [],
    ]);

    const activeAcademicYear = allAcademicYears.find((y) => y.isCurrent) || allAcademicYears[0];

    // In-memory sets and maps for O(1) lookups
    const existingAdmissionNumbersSet = new Set(
      existingStudentsWithAdmission.map((s) => String(s.admissionNumber).trim().toLowerCase())
    );

    const guardianMap = new Map();
    for (const g of existingGuardians) {
      if (g.phone) {
        guardianMap.set(g.phone, g);
      }
    }

    const gradeById = new Map();
    const gradeByNameOrCode = new Map();
    for (const g of allGrades) {
      gradeById.set(String(g._id), g);
      if (g.name) gradeByNameOrCode.set(g.name.toLowerCase().trim(), g);
      if (g.code) gradeByNameOrCode.set(g.code.toLowerCase().trim(), g);
    }

    const sectionById = new Map();
    const sectionsByGradeAndName = new Map();
    const sectionsByNameOnly = new Map();

    for (const s of allSections) {
      const sId = String(s._id);
      const sName = (s.name || '').toLowerCase().trim();
      const sGradeId = s.gradeId ? String(s.gradeId) : '';

      sectionById.set(sId, s);
      if (sGradeId && sName) {
        sectionsByGradeAndName.set(`${sGradeId}:${sName}`, s);
      }
      if (sName && !sectionsByNameOnly.has(sName)) {
        sectionsByNameOnly.set(sName, s);
      }
    }

    const results = {
      total: students.length,
      importedCount: 0,
      skippedCount: 0,
      importedStudents: [],
      errors: [],
    };

    for (let i = 0; i < students.length; i++) {
      const raw = students[i];
      const rowNum = i + 1;

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
      const customAdmissionNumber = sanitizeText(raw.admissionNumber);
      const rollNumber = sanitizeText(raw.rollNumber);

      const street = sanitizeText(raw.street || raw.address?.street);
      const city = sanitizeText(raw.city || raw.address?.city);
      const state = sanitizeText(raw.state || raw.address?.state);
      const postalCode = sanitizePhone(raw.postalCode || raw.address?.postalCode);
      const country = sanitizeText(raw.country || raw.address?.country) || 'India';

      const guardianName = sanitizeText(raw.guardianName);
      let guardianRelationship = sanitizeText(raw.guardianRelationship).toUpperCase() || 'FATHER';
      const guardianPhone = sanitizePhone(raw.guardianPhone);
      const guardianEmail = sanitizeText(raw.guardianEmail).toLowerCase();

      // Row Validation
      const rowErrors = [];
      if (!firstName) rowErrors.push('First Name is required');
      if (!lastName) rowErrors.push('Last Name is required');

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

      // DOB validation
      let dobDate = null;
      if (!rawDob) {
        rowErrors.push('Date of Birth is required');
      } else {
        dobDate = new Date(rawDob);
        if (isNaN(dobDate.getTime())) {
          rowErrors.push('Invalid Date of Birth format');
        }
      }

      // Prevent duplicate admission numbers (O(1) Set lookup)
      if (customAdmissionNumber) {
        if (existingAdmissionNumbersSet.has(customAdmissionNumber.toLowerCase())) {
          rowErrors.push(`Admission Number "${customAdmissionNumber}" already exists`);
        }
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

      // Generate sequence numbers if not custom provided
      const studentNumber = await generateSequenceNumber(schoolId, 'STUDENT');
      const admissionNumber = customAdmissionNumber || (await generateSequenceNumber(schoolId, 'ADMISSION'));

      // Create student
      const student = await Student.create({
        schoolId,
        studentNumber,
        admissionNumber,
        rollNumber,
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
        status: 'ACTIVE',
      });

      // Track newly created custom admission number in batch cache
      if (customAdmissionNumber) {
        existingAdmissionNumbersSet.add(customAdmissionNumber.toLowerCase());
      }

      // Create & link guardian if present (O(1) in-memory cached lookup)
      if (guardianName || guardianPhone) {
        let guardian = null;
        if (guardianPhone) {
          guardian = guardianMap.get(guardianPhone) || null;
        }
        if (!guardian && (guardianName || guardianPhone)) {
          guardian = await Guardian.create({
            schoolId,
            name: guardianName || 'Parent / Guardian',
            relationship: guardianRelationship,
            phone: guardianPhone || '',
            email: guardianEmail || '',
            address: street || '',
            isPrimary: true,
            isEmergencyContact: true,
          });
          if (guardianPhone) {
            guardianMap.set(guardianPhone, guardian);
          }
        }
        if (guardian) {
          await StudentGuardian.create({
            schoolId,
            studentId: student._id,
            guardianId: guardian._id,
            relationship: guardianRelationship,
            isPrimary: true,
            isEmergencyContact: true,
          });
        }
      }

      // Resolve Grade and Section for placement enrollment (O(1) Map lookups)
      let resolvedGradeId = defaultGradeId || null;
      let resolvedSectionId = defaultSectionId || null;
      let resolvedAyId = defaultAcademicYearId || activeAcademicYear?._id || null;

      // Check if row specifies grade by name or ID
      const rawGrade = sanitizeText(raw.grade || raw.gradeLevel || raw.gradeName || raw.standard);
      if (rawGrade) {
        const foundGrade = gradeById.get(rawGrade) || gradeByNameOrCode.get(rawGrade.toLowerCase());
        if (foundGrade) resolvedGradeId = foundGrade._id;
      }

      // Check if row specifies section by name or ID
      const rawSection = sanitizeText(raw.section || raw.sectionName || raw.classSection);
      if (rawSection) {
        const rawSectionLower = rawSection.toLowerCase();
        let foundSection = sectionById.get(rawSection);
        if (!foundSection && resolvedGradeId) {
          foundSection = sectionsByGradeAndName.get(`${String(resolvedGradeId)}:${rawSectionLower}`);
        }
        if (!foundSection && !resolvedGradeId) {
          foundSection = sectionsByNameOnly.get(rawSectionLower);
        }
        if (foundSection) {
          resolvedSectionId = foundSection._id;
          if (!resolvedGradeId) resolvedGradeId = foundSection.gradeId;
        }
      }

      // If both Grade and Section are resolved, create active enrollment
      let enrollment = null;
      if (resolvedGradeId && resolvedSectionId && resolvedAyId) {
        enrollment = await Enrollment.create({
          schoolId,
          studentId: student._id,
          academicYearId: resolvedAyId,
          gradeId: resolvedGradeId,
          sectionId: resolvedSectionId,
          rollNumber: rollNumber || '',
          status: 'ENROLLED',
          isCurrent: true,
        });

        await AcademicHistory.create({
          schoolId,
          studentId: student._id,
          academicYearId: resolvedAyId,
          gradeId: resolvedGradeId,
          sectionId: resolvedSectionId,
          enrollmentId: enrollment._id,
          promotionStatus: 'PROMOTED',
          remarks: 'Imported via Student Master Bulk Import',
        });
      }

      results.importedCount++;
      results.importedStudents.push({
        _id: student._id,
        id: String(student._id),
        studentNumber: student.studentNumber,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender,
        status: student.status,
        enrollmentId: enrollment?._id || null,
      });
    }

    await logAuditEvent(req, 'BULK_IMPORT', 'STUDENT', null, null, {
      totalProvided: students.length,
      importedCount: results.importedCount,
      skippedCount: results.skippedCount,
    });

    return successResponse(
      res,
      results,
      `Successfully imported ${results.importedCount} student(s)${results.skippedCount > 0 ? ` (${results.skippedCount} skipped due to errors)` : ''}`,
      201
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStudents,
  getStudent360,
  getStudentById: getStudent360,
  createStudent,
  bulkImportStudents,
  updateStudent,
  updateStudentStatus,
  deleteStudent,
  restoreStudent,
};
