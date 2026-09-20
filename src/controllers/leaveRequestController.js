const LeaveRequest = require('../models/LeaveRequest');
const AcademicYear = require('../models/AcademicYear');
const Student = require('../models/Student');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getLeaveRequests = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId, status, page = 1, limit = 50 } = req.query;

    const query = { schoolId, status: { $ne: 'ARCHIVED' } };
    if (studentId) query.studentId = studentId;
    if (status) query.status = status;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [totalRecords, requests] = await Promise.all([
      LeaveRequest.countDocuments(query),
      LeaveRequest.find(query)
        .populate('studentId', 'firstName lastName studentNumber admissionNumber email phone')
        .populate('academicYearId', 'name code')
        .populate('approvedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    const formatted = requests.map((r) => ({ ...r, id: String(r._id) }));
    return res.status(200).json({
      success: true,
      data: formatted,
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

const createLeaveRequest = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId, academicYearId, fromDate, toDate, reason, requestedBy = 'PARENT' } = req.body;

    const student = await Student.findOne({ _id: studentId, schoolId });
    if (!student) throw new NotFoundError('Student not found in this school.');

    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Valid fromDate and toDate are required.');
    }
    if (start > end) {
      throw new ValidationError('From date must be on or before To date.');
    }

    if (!reason || !String(reason).trim()) {
      throw new ValidationError('Reason is required for leave requests.');
    }

    let targetAY = academicYearId;
    if (!targetAY) {
      const activeAY = await AcademicYear.findOne({ schoolId, isCurrent: true, status: 'ACTIVE' });
      targetAY = activeAY?._id;
    }

    // Overlap validation: Check if student has pending or approved leave overlapping these dates
    const overlapping = await LeaveRequest.findOne({
      schoolId,
      studentId,
      status: { $in: ['PENDING', 'APPROVED'] },
      $or: [
        { fromDate: { $lte: start }, toDate: { $gte: start } },
        { fromDate: { $lte: end }, toDate: { $gte: end } },
        { fromDate: { $gte: start }, toDate: { $lte: end } },
      ],
    });

    if (overlapping) {
      throw new ValidationError('A leave request already exists covering the selected dates.');
    }

    const leave = await LeaveRequest.create({
      schoolId,
      studentId,
      academicYearId: targetAY,
      fromDate: start,
      toDate: end,
      reason: String(reason).trim(),
      requestedBy: String(requestedBy || 'PARENT').trim(),
      status: 'PENDING',
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'CREATE',
      entity: 'LeaveRequest',
      entityId: leave._id.toString(),
      newValues: leave.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, leave, 'Leave request submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateLeaveStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
      throw new ValidationError('Invalid leave request status. Allowed: APPROVED, REJECTED, CANCELLED');
    }

    const leave = await LeaveRequest.findOne({ _id: id, schoolId });
    if (!leave) throw new NotFoundError('Leave request not found');

    // Workflow validation: Prevent arbitrary status reversals like APPROVED -> PENDING
    if (leave.status === 'REJECTED' && status === 'APPROVED') {
      throw new ValidationError('Cannot approve a previously rejected leave request without resubmission.');
    }
    if (leave.status === 'CANCELLED') {
      throw new ValidationError('Cannot modify a cancelled leave request.');
    }

    if (status === 'REJECTED' && (!remarks || !String(remarks).trim())) {
      throw new ValidationError('A rejection reason is required when rejecting a leave request.');
    }

    const oldValues = leave.toObject();
    leave.status = status;
    leave.remarks = String(remarks || '').trim();

    if (status === 'APPROVED') {
      leave.approvedBy = req.user?._id;
      leave.approvedAt = new Date();
    }

    await leave.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'UPDATE_STATUS',
      entity: 'LeaveRequest',
      entityId: leave._id.toString(),
      oldValues,
      newValues: leave.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, leave, `Leave request ${status.toLowerCase()} successfully`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLeaveRequests,
  createLeaveRequest,
  updateLeaveStatus,
};
