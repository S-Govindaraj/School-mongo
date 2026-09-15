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
    if (!student) throw new NotFoundError('Student not found');

    let targetAY = academicYearId;
    if (!targetAY) {
      const activeAY = await AcademicYear.findOne({ schoolId, isCurrent: true, status: 'ACTIVE' });
      targetAY = activeAY?._id;
    }

    const leave = await LeaveRequest.create({
      schoolId,
      studentId,
      academicYearId: targetAY,
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
      reason: String(reason || '').trim(),
      requestedBy: String(requestedBy || 'PARENT').trim(),
      status: 'PENDING',
    });

    await logAuditEvent(req, 'LEAVE_CREATE', 'LeaveRequest', leave._id, null, leave);

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
      throw new ValidationError('Invalid leave request status');
    }

    const leave = await LeaveRequest.findOne({ _id: id, schoolId });
    if (!leave) throw new NotFoundError('Leave request not found');

    leave.status = status;
    leave.remarks = String(remarks || '').trim();
    if (status === 'APPROVED') {
      leave.approvedBy = req.user._id;
      leave.approvedAt = new Date();
    }
    await leave.save();

    await logAuditEvent(req, 'LEAVE_STATUS_UPDATE', 'LeaveRequest', leave._id, null, { status, remarks });

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
