const TeacherAssignment = require('../models/TeacherAssignment');
const Staff = require('../models/Staff');
const Section = require('../models/Section');
const Grade = require('../models/Grade');
const Subject = require('../models/Subject');
const AcademicYear = require('../models/AcademicYear');
const ClassSubject = require('../models/ClassSubject');
const Timetable = require('../models/Timetable');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const validateTeacherAssignment = async (schoolId, data, currentId = null) => {
  const {
    academicYearId,
    gradeId,
    sectionId,
    subjectId,
    staffId: bodyStaffId,
    teacherId,
    assignmentType = 'PRIMARY',
    startDate,
    endDate,
  } = data;

  const staffId = bodyStaffId || teacherId;
  if (!staffId) throw new ValidationError('Staff member ID is required.');

  // Phase 1: entity lookups in parallel
  const lookups = [
    AcademicYear.findOne({ _id: academicYearId, schoolId }),
    Staff.findOne({ _id: staffId, schoolId }),
    Grade.findOne({ _id: gradeId, schoolId }),
    Section.findOne({ _id: sectionId, schoolId }),
  ];

  if (subjectId) {
    lookups.push(
      Subject.findOne({ _id: subjectId, schoolId }),
      ClassSubject.findOne({ schoolId, academicYearId, gradeId, subjectId, status: { $ne: 'ARCHIVED' } })
    );
  }

  const [year, staff, grade, section, subject, classSubject] = await Promise.all(lookups);

  if (!year)    throw new ValidationError('Selected academic year does not exist in this school.');
  if (!staff)   throw new ValidationError('Assigned teacher/staff member does not exist in this school.');
  if (staff.status === 'INACTIVE' || staff.status === 'ARCHIVED')
                throw new ValidationError('Cannot assign an inactive or archived staff member.');
  if (!grade)   throw new ValidationError('Selected grade does not exist in this school.');
  if (!section) throw new ValidationError('Selected section does not exist in this school.');
  if (String(section.gradeId) !== String(gradeId))
                throw new ValidationError('Selected section does not belong to the selected grade.');

  if (subjectId) {
    if (!subject) throw new ValidationError('Selected subject does not exist in this school.');
    if (!classSubject) throw new ValidationError('This subject is not configured for the selected class.');
  }

  // Date validation (pure JS — no DB call needed)
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) throw new ValidationError('Start date must be before end date.');
    if (start < new Date(year.startDate) || end > new Date(year.endDate)) {
      throw new ValidationError('Assignment dates must fall within the academic year period.');
    }
  }

  // Phase 2: duplicate + primary conflict checks in parallel
  const duplicateQuery = {
    schoolId,
    academicYearId,
    gradeId,
    sectionId,
    subjectId: subjectId || null,
    staffId,
    status: { $ne: 'ARCHIVED' },
  };
  if (currentId) duplicateQuery._id = { $ne: currentId };

  const primaryQuery = (assignmentType === 'PRIMARY' && subjectId)
    ? { schoolId, academicYearId, gradeId, sectionId, subjectId, assignmentType: 'PRIMARY', status: { $ne: 'ARCHIVED' } }
    : null;
  if (primaryQuery && currentId) primaryQuery._id = { $ne: currentId };

  const [existing, existingPrimary] = await Promise.all([
    TeacherAssignment.findOne(duplicateQuery),
    primaryQuery ? TeacherAssignment.findOne(primaryQuery) : Promise.resolve(null),
  ]);

  if (existing) throw new ValidationError(subjectId ? 'This teacher is already assigned to this subject and section for the selected academic year.' : 'This teacher is already assigned to this section for the selected academic year.');
  if (existingPrimary) throw new ValidationError('A primary teacher is already assigned to this class subject. Please assign as Assistant or Co-teacher.');
};

const getTeacherAssignments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, gradeId, sectionId, staffId, teacherId, search, status, includeArchived } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }
    if (academicYearId) filter.academicYearId = academicYearId;
    if (gradeId) filter.gradeId = gradeId;
    if (sectionId) filter.sectionId = sectionId;

    // Filter by Assigned Faculty Teacher (supports both staffId and teacherId query params)
    const targetStaffId = staffId || teacherId;
    if (targetStaffId) filter.staffId = targetStaffId;

    // Search by teacher name or employee ID
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      const staffQuery = {
        schoolId,
        $or: [
          { firstName: regex },
          { lastName: regex },
          { employeeId: regex },
        ],
      };
      if (targetStaffId) staffQuery._id = targetStaffId;
      const matchingStaff = await Staff.find(staffQuery).select('_id').lean();
      const staffIds = matchingStaff.map((s) => s._id);
      filter.staffId = { $in: staffIds };
    }

    const list = await TeacherAssignment.find(filter)
      .populate('staffId', 'firstName lastName employeeId designation email phone')
      .populate('gradeId', 'name code')
      .populate('sectionId', 'name code room')
      .populate('subjectId', 'name code shortName')
      .populate('academicYearId', 'name code isCurrent')
      .sort({ createdAt: -1 })
      .lean();

    return successResponse(res, list, 'Teacher assignments retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createTeacherAssignment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    await validateTeacherAssignment(schoolId, req.body);

    const {
      academicYearId,
      gradeId,
      sectionId,
      subjectId,
      staffId: bodyStaffId,
      teacherId,
      isClassTeacher = false,
      assignmentType = 'PRIMARY',
      startDate,
      endDate,
      status: requestedStatus,
    } = req.body;

    const staffId = bodyStaffId || teacherId;

    // Single class teacher per section
    if (isClassTeacher) {
      await TeacherAssignment.updateMany(
        { schoolId, academicYearId, sectionId, isClassTeacher: true },
        { isClassTeacher: false }
      );
      await Section.updateOne({ _id: sectionId, schoolId }, { $set: { classTeacherId: staffId } });
    }

    const status = requestedStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';

    const assignment = await TeacherAssignment.create({
      schoolId,
      academicYearId,
      gradeId,
      sectionId,
      subjectId: subjectId || null,
      staffId,
      isClassTeacher: Boolean(isClassTeacher),
      assignmentType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
    });

    const populated = await TeacherAssignment.findById(assignment._id)
      .populate('staffId')
      .populate('gradeId')
      .populate('sectionId')
      .populate('subjectId')
      .populate('academicYearId');

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ASSIGN',
      entity: 'TeacherAssignment',
      entityId: assignment._id.toString(),
      newValues: assignment.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, populated, 'Teacher assigned successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateTeacherAssignment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const assignment = await TeacherAssignment.findOne({ _id: id, schoolId });
    if (!assignment) {
      throw new NotFoundError('Teacher assignment not found.');
    }

    const oldValues = assignment.toObject();
    const merged = { ...assignment.toObject(), ...req.body };
    await validateTeacherAssignment(schoolId, merged, id);

    if (req.body.isClassTeacher) {
      await TeacherAssignment.updateMany(
        { schoolId, academicYearId: merged.academicYearId, sectionId: merged.sectionId, _id: { $ne: id }, isClassTeacher: true },
        { isClassTeacher: false }
      );
      const effectiveStaffId = req.body.staffId || assignment.staffId;
      await Section.updateOne({ _id: merged.sectionId, schoolId }, { $set: { classTeacherId: effectiveStaffId } });
    }

    Object.assign(assignment, req.body);
    await assignment.save();

    const populated = await TeacherAssignment.findById(assignment._id)
      .populate('staffId')
      .populate('gradeId')
      .populate('sectionId')
      .populate('subjectId')
      .populate('academicYearId');

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'UPDATE',
      entity: 'TeacherAssignment',
      entityId: assignment._id.toString(),
      oldValues,
      newValues: assignment.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, populated, 'Teacher assignment updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteTeacherAssignment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const assignment = await TeacherAssignment.findOne({ _id: id, schoolId });
    if (!assignment) {
      throw new NotFoundError('Teacher assignment not found.');
    }

    // Check if active timetable entries exist for this teacher and section/subject
    const hasTimetable = assignment.subjectId
      ? await Timetable.countDocuments({
          schoolId,
          academicYearId: assignment.academicYearId,
          sectionId: assignment.sectionId,
          subjectId: assignment.subjectId,
          teacherId: assignment.staffId,
          status: { $ne: 'ARCHIVED' },
        })
      : 0;

    if (hasTimetable > 0) {
      throw new ValidationError(
        'This teacher assignment cannot be deleted because active timetable slots reference this assignment.'
      );
    }

    assignment.status = 'INACTIVE';
    await assignment.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'TeacherAssignment',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Teacher assignment deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restoreTeacherAssignment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const assignment = await TeacherAssignment.findOne({ _id: id, schoolId });
    if (!assignment) {
      throw new NotFoundError('Teacher assignment not found.');
    }

    assignment.status = 'ACTIVE';
    await assignment.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'TeacherAssignment',
      entityId: assignment._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, assignment, 'Teacher assignment activated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeacherAssignments,
  createTeacherAssignment,
  updateTeacherAssignment,
  deleteTeacherAssignment,
  restoreTeacherAssignment,
};
