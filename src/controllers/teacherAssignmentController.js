const TeacherAssignment = require('../models/TeacherAssignment');
const Staff = require('../models/Staff');
const Section = require('../models/Section');
const Grade = require('../models/Grade');
const Subject = require('../models/Subject');
const AcademicYear = require('../models/AcademicYear');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getTeacherAssignments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, gradeId, sectionId, staffId } = req.query;

    const filter = { schoolId, status: { $ne: 'ARCHIVED' } };
    if (academicYearId) filter.academicYearId = academicYearId;
    if (gradeId) filter.gradeId = gradeId;
    if (sectionId) filter.sectionId = sectionId;
    if (staffId) filter.staffId = staffId;

    const list = await TeacherAssignment.find(filter)
      .populate('staffId')
      .populate('gradeId')
      .populate('sectionId')
      .populate('subjectId')
      .populate('academicYearId')
      .sort({ createdAt: -1 });

    return successResponse(res, list, 'Teacher assignments retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createTeacherAssignment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, gradeId, sectionId, subjectId, staffId, isClassTeacher = false } = req.body;

    const staff = await Staff.findOne({ _id: staffId, schoolId });
    if (!staff) {
      throw new ValidationError('Assigned teacher/staff member does not exist in this school.');
    }

    const section = await Section.findOne({ _id: sectionId, schoolId, gradeId });
    if (!section) {
      throw new ValidationError('Section does not belong to the selected grade or school.');
    }

    const existing = await TeacherAssignment.findOne({
      schoolId,
      academicYearId,
      sectionId,
      subjectId,
      staffId,
    });

    if (existing && existing.status !== 'ARCHIVED') {
      throw new ValidationError('This teacher is already assigned to this subject and section for the selected academic year.');
    }

    if (isClassTeacher) {
      await TeacherAssignment.updateMany(
        { schoolId, academicYearId, sectionId, isClassTeacher: true },
        { isClassTeacher: false }
      );
    }

    let assignment;
    if (existing && existing.status === 'ARCHIVED') {
      existing.isClassTeacher = Boolean(isClassTeacher);
      existing.status = 'ACTIVE';
      assignment = await existing.save();
    } else {
      assignment = await TeacherAssignment.create({
        schoolId,
        academicYearId,
        gradeId,
        sectionId,
        subjectId,
        staffId,
        isClassTeacher: Boolean(isClassTeacher),
        status: 'ACTIVE',
      });
    }

    const populated = await TeacherAssignment.findById(assignment._id)
      .populate('staffId')
      .populate('gradeId')
      .populate('sectionId')
      .populate('subjectId')
      .populate('academicYearId');

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
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

const deleteTeacherAssignment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const assignment = await TeacherAssignment.findOne({ _id: id, schoolId });
    if (!assignment) {
      throw new NotFoundError('Teacher assignment not found.');
    }

    await TeacherAssignment.deleteOne({ _id: id, schoolId });

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UNASSIGN',
      entity: 'TeacherAssignment',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Teacher assignment removed successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeacherAssignments,
  createTeacherAssignment,
  deleteTeacherAssignment,
};
