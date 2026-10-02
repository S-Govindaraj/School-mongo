const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const Student = require('../models/Student');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { resolveScopedGuardianIds } = require('../services/staffAccessScopeService');

// Staff In-Charge / Class Teacher guard for single-record guardian endpoints —
// throws the same NotFoundError a wrong-schoolId lookup already throws, so an
// out-of-scope record is indistinguishable from a nonexistent one.
async function assertGuardianInScope(req, schoolId, guardianId) {
  const scope = req.staffAccessScope;
  if (!scope || scope.mode === 'ALL') return;
  const allowed = await resolveScopedGuardianIds(scope, schoolId);
  if (allowed !== null && !allowed.includes(String(guardianId))) {
    throw new NotFoundError('Guardian not found');
  }
}

const getGuardians = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { search = '', status = '', includeArchived, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId };
    if (status && status !== 'ALL') {
      query.status = status;
    } else if (includeArchived === 'false') {
      query.status = { $ne: 'ARCHIVED' };
    }
    if (search.trim()) {
      const s = String(search).trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
      ];
    }

    const allowedGuardianIds = await resolveScopedGuardianIds(req.staffAccessScope, schoolId);
    if (allowedGuardianIds !== null) {
      query._id = { $in: allowedGuardianIds };
    }

    const [totalRecords, guardians] = await Promise.all([
      Guardian.countDocuments(query),
      Guardian.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    ]);

    // Attach linked students + their current Section/Class via Enrollment (gradeId/sectionId populated)
    const Enrollment = require('../models/Enrollment');
    const guardianIds = guardians.map((g) => g._id);
    const links = await StudentGuardian.find({ schoolId, guardianId: { $in: guardianIds } })
      .populate('studentId', 'firstName lastName studentNumber admissionNumber status')
      .lean();

    const linkMap = {};
    links.forEach((l) => {
      const gId = String(l.guardianId);
      if (!linkMap[gId]) linkMap[gId] = [];
      if (l.studentId) linkMap[gId].push(l.studentId);
    });

    // Resolve current enrollment per student for section/class
    const studentIds = [...new Set(links.map((l) => String(l.studentId?._id || l.studentId)).filter(Boolean))];
    const enrollmentMap = {};
    if (studentIds.length > 0) {
      const enrollments = await Enrollment.find({ schoolId, studentId: { $in: studentIds }, isCurrent: true })
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code')
        .lean();
      enrollments.forEach((e) => {
        enrollmentMap[String(e.studentId)] = {
          gradeId: e.gradeId?._id || e.gradeId || null,
          grade: e.gradeId?.name || null,
          sectionId: e.sectionId?._id || e.sectionId || null,
          section: e.sectionId?.name || null,
        };
      });
    }
    Object.keys(linkMap).forEach((gId) => {
      linkMap[gId] = linkMap[gId].map((s) => {
        const enr = enrollmentMap[String(s._id || s.id || s)] || {};
        return {
          ...s,
          gradeId: enr.gradeId ?? s.gradeId ?? null,
          grade: enr.grade ?? s.grade ?? null,
          sectionId: enr.sectionId ?? s.sectionId ?? null,
          section: enr.section ?? s.section ?? null,
        };
      });
    });

    const formattedGuardians = guardians.map((g) => ({
      ...g,
      id: String(g._id),
      students: linkMap[String(g._id)] || [],
    }));

    return res.status(200).json({
      success: true,
      data: formattedGuardians,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const guardian = await Guardian.create({ ...req.body, schoolId });
    await logAuditEvent(req, 'CREATE', 'GUARDIAN', guardian._id, null, guardian);
    return successResponse(res, guardian, 'Guardian created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const guardian = await Guardian.findOne({ _id: id, schoolId });
    if (!guardian) throw new NotFoundError('Guardian not found');
    await assertGuardianInScope(req, schoolId, id);

    const previousState = guardian.toObject();
    Object.assign(guardian, req.body);
    await guardian.save();

    await logAuditEvent(req, 'UPDATE', 'GUARDIAN', id, previousState, guardian);
    return successResponse(res, guardian, 'Guardian updated successfully');
  } catch (error) {
    next(error);
  }
};

const getGuardianById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const guardian = await Guardian.findOne({ _id: req.params.id, schoolId });
    if (!guardian) throw new NotFoundError('Guardian not found');
    await assertGuardianInScope(req, schoolId, req.params.id);
    return successResponse(res, guardian, 'Guardian retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const linkGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId, guardianId, relationship, isPrimary, isEmergencyContact } = req.body;

    const link = await StudentGuardian.findOneAndUpdate(
      { schoolId, studentId, guardianId },
      { relationship, isPrimary: !!isPrimary, isEmergencyContact: !!isEmergencyContact },
      { upsert: true, new: true }
    );

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'LINK',
      entity: 'StudentGuardian',
      entityId: link._id.toString(),
      newValues: link.toObject ? link.toObject() : link,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, link, 'Guardian linked to student successfully');
  } catch (error) {
    next(error);
  }
};

const deleteGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const guardian = await Guardian.findOne({ _id: id, schoolId });
    if (!guardian) {
      throw new NotFoundError('Guardian not found.');
    }
    await assertGuardianInScope(req, schoolId, id);

    guardian.status = 'INACTIVE';
    await guardian.save();

    // If guardian was set as emergency contact on linked students, clear it
    const links = await StudentGuardian.find({ schoolId, guardianId: id });
    for (const link of links) {
      await Student.updateOne(
        { _id: link.studentId, schoolId, 'emergencyContact.name': guardian.name },
        { $set: { 'emergencyContact.name': '', 'emergencyContact.relationship': '', 'emergencyContact.phone': '' } }
      );
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'Guardian',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Guardian deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restoreGuardian = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const guardian = await Guardian.findOne({ _id: id, schoolId });
    if (!guardian) {
      throw new NotFoundError('Guardian not found.');
    }
    await assertGuardianInScope(req, schoolId, id);

    const oldValues = guardian.toObject();
    guardian.status = 'ACTIVE';
    await guardian.save();

    // If restored guardian is marked as emergency contact, re-link on linked students if empty
    if (guardian.isEmergencyContact) {
      const links = await StudentGuardian.find({ schoolId, guardianId: id });
      for (const link of links) {
        await Student.updateOne(
          { _id: link.studentId, schoolId, $or: [{ 'emergencyContact.name': '' }, { 'emergencyContact.name': null }] },
          { $set: { 'emergencyContact.name': guardian.name, 'emergencyContact.relationship': link.relationship || guardian.relationship, 'emergencyContact.phone': guardian.phone } }
        );
      }
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'Guardian',
      entityId: id,
      oldValues,
      newValues: guardian.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, guardian, 'Guardian activated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk Import Parents & Guardians
 * Upserts guardian by phone number and connects guardian to student by studentNumber (e.g. STU-2026-00335)
 */
const bulkImportGuardians = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { guardians = [] } = req.body;

    if (!Array.isArray(guardians) || guardians.length === 0) {
      throw new ValidationError('No guardian/parent records provided for bulk import');
    }

    if (guardians.length > 500) {
      throw new ValidationError('Maximum 500 guardian records can be imported in a single batch');
    }

    const results = {
      total: guardians.length,
      importedCount: 0,
      skippedCount: 0,
      importedGuardians: [],
      errors: [],
    };

    const sanitizeText = (val) => {
      if (val === undefined || val === null) return '';
      return String(val).trim().replace(/\s+/g, ' ');
    };

    const sanitizePhone = (val) => {
      if (!val) return '';
      return String(val).replace(/[\s\-\(\)\+]/g, '').trim();
    };

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Pre-extract unique phone numbers and student identifiers from batch
    const phones = [];
    const studentIdentifiers = [];
    for (let i = 0; i < guardians.length; i++) {
      const raw = guardians[i];
      const p = sanitizePhone(raw.phone || raw.mobileNumber || raw.mobile);
      if (p) phones.push(p);
      const sn = sanitizeText(raw.studentNumber || raw.studentId || raw.admissionNumber || raw.wardId);
      if (sn) studentIdentifiers.push(sn);
    }

    const uniquePhones = Array.from(new Set(phones));
    const uniqueStudentIdentifiers = Array.from(new Set(studentIdentifiers));

    // Preload existing guardians and students in parallel
    const [existingGuardians, matchedStudents] = await Promise.all([
      uniquePhones.length > 0 ? Guardian.find({ schoolId, phone: { $in: uniquePhones } }) : [],
      uniqueStudentIdentifiers.length > 0
        ? Student.find({
            schoolId,
            $or: [
              { studentNumber: { $in: uniqueStudentIdentifiers.map((s) => new RegExp(`^${escapeRegex(s)}$`, 'i')) } },
              { admissionNumber: { $in: uniqueStudentIdentifiers.map((s) => new RegExp(`^${escapeRegex(s)}$`, 'i')) } },
            ],
          })
        : [],
    ]);

    // Build Maps for O(1) lookups
    const guardianMap = new Map();
    for (const g of existingGuardians) {
      if (g.phone) guardianMap.set(g.phone, g);
    }

    const studentMap = new Map();
    for (const s of matchedStudents) {
      if (s.studentNumber) studentMap.set(s.studentNumber.toLowerCase().trim(), s);
      if (s.admissionNumber) studentMap.set(s.admissionNumber.toLowerCase().trim(), s);
    }

    for (let i = 0; i < guardians.length; i++) {
      const raw = guardians[i];
      const rowNum = i + 1;

      const name = sanitizeText(raw.name || raw.parentName || raw.guardianName);
      let relationship = sanitizeText(raw.relationship || raw.guardianRelationship).toUpperCase();
      const phone = sanitizePhone(raw.phone || raw.mobileNumber || raw.mobile);
      const email = sanitizeText(raw.email).toLowerCase();
      const occupation = sanitizeText(raw.occupation);
      const address = sanitizeText(raw.address);
      const rawStudentNumber = sanitizeText(raw.studentNumber || raw.studentId || raw.admissionNumber || raw.wardId);

      const rawIsPrimary = raw.isPrimary;
      const isPrimary =
        rawIsPrimary === true ||
        rawIsPrimary === 'true' ||
        rawIsPrimary === 1 ||
        rawIsPrimary === '1' ||
        String(rawIsPrimary).toUpperCase() === 'YES' ||
        rawIsPrimary === undefined;

      const rawIsEmergency = raw.isEmergencyContact;
      const isEmergencyContact =
        rawIsEmergency === true ||
        rawIsEmergency === 'true' ||
        rawIsEmergency === 1 ||
        rawIsEmergency === '1' ||
        String(rawIsEmergency).toUpperCase() === 'YES' ||
        rawIsEmergency === undefined;

      const rowErrors = [];
      if (!name) {
        rowErrors.push('Parent / Guardian Name is required');
      } else if (name.length < 2) {
        rowErrors.push('Parent Name must be at least 2 characters');
      }

      if (!phone) {
        rowErrors.push('Mobile Phone Number is required');
      } else if (!/^\d{10}$/.test(phone)) {
        rowErrors.push('Mobile Phone Number must be exactly 10 digits');
      }

      // Relationship validation & normalization
      if (!['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'].includes(relationship)) {
        if (relationship === 'DAD' || relationship === 'PAPPA' || relationship === 'APPA') relationship = 'FATHER';
        else if (relationship === 'MOM' || relationship === 'AMMA') relationship = 'MOTHER';
        else relationship = 'GUARDIAN';
      }

      // Email validation if provided
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push('Invalid email address format');
      }

      // Resolve linked student (e.g. STU-2026-00335) from in-memory map
      let student = null;
      if (rawStudentNumber) {
        student = studentMap.get(rawStudentNumber.toLowerCase().trim()) || null;

        if (!student) {
          rowErrors.push(`Student with ID / Admission Number "${rawStudentNumber}" not found in system`);
        }
      }

      if (rowErrors.length > 0) {
        results.skippedCount++;
        results.errors.push({
          row: rowNum,
          name: name || `Row ${rowNum}`,
          errors: rowErrors,
        });
        continue;
      }

      // Upsert Guardian by schoolId and phone via in-memory map cache (O(1))
      let guardian = guardianMap.get(phone) || null;
      if (guardian) {
        guardian.name = name;
        guardian.relationship = relationship;
        if (email) guardian.email = email;
        if (occupation) guardian.occupation = occupation;
        if (address) guardian.address = address;
        guardian.isPrimary = isPrimary;
        guardian.isEmergencyContact = isEmergencyContact;
        guardian.status = 'ACTIVE';
        await guardian.save();
      } else {
        guardian = await Guardian.create({
          schoolId,
          name,
          relationship,
          phone,
          email,
          occupation,
          address,
          isPrimary,
          isEmergencyContact,
          status: 'ACTIVE',
        });
        guardianMap.set(phone, guardian);
      }

      // If student was resolved, connect parent and student via StudentGuardian
      if (student) {
        await StudentGuardian.findOneAndUpdate(
          { schoolId, studentId: student._id, guardianId: guardian._id },
          {
            relationship,
            isPrimary,
            isEmergencyContact,
          },
          { upsert: true, new: true }
        );

        // If marked as emergency contact, update student's emergency contact record
        if (isEmergencyContact) {
          await Student.updateOne(
            { _id: student._id, schoolId },
            {
              $set: {
                'emergencyContact.name': guardian.name,
                'emergencyContact.relationship': relationship,
                'emergencyContact.phone': guardian.phone,
              },
            }
          );
        }
      }

      results.importedCount++;
      results.importedGuardians.push({
        id: guardian._id,
        name: guardian.name,
        relationship: guardian.relationship,
        phone: guardian.phone,
        linkedStudent: student ? (student.studentNumber || student.admissionNumber) : null,
      });
    }

    logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'BULK_IMPORT',
      entity: 'Guardian',
      entityId: schoolId.toString(),
      newValues: {
        total: results.total,
        importedCount: results.importedCount,
        skippedCount: results.skippedCount,
      },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, results, `Successfully imported ${results.importedCount} guardians`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGuardians,
  getGuardianById,
  createGuardian,
  updateGuardian,
  deleteGuardian,
  restoreGuardian,
  linkGuardian,
  linkGuardianToStudent: linkGuardian,
  bulkImportGuardians,
};

