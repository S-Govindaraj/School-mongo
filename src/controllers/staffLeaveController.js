/**
 * Phase 8 — Staff Leave Management Controller
 */
const LeaveType = require('../models/LeaveType');
const LeaveBalance = require('../models/LeaveBalance');
const StaffLeaveRequest = require('../models/StaffLeaveRequest');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

// ─── Leave Types ─────────────────────────────────────────
exports.listLeaveTypes = async (req, res, next) => {
  try {
    const types = await LeaveType.find({ schoolId: req.schoolContext.schoolId }).lean();
    return successResponse(res, types, 'Leave types retrieved');
  } catch (err) { next(err); }
};

exports.createLeaveType = async (req, res, next) => {
  try {
    const { code, name, maxDays, carryForward, isPaid, applicableFor, description } = req.body;
    if (!code || !name) throw new ValidationError('code and name are required');
    const lt = await LeaveType.create({
      schoolId: req.schoolContext.schoolId, code, name, maxDays, carryForward, isPaid, applicableFor, description
    });
    return successResponse(res, lt, 'Leave type created', 201);
  } catch (err) { next(err); }
};

exports.updateLeaveType = async (req, res, next) => {
  try {
    const lt = await LeaveType.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!lt) throw new NotFoundError('Leave type not found');
    const allowed = ['name', 'maxDays', 'carryForward', 'isPaid', 'applicableFor', 'description', 'isActive'];
    allowed.forEach((k) => { if (req.body[k] !== undefined) lt[k] = req.body[k]; });
    await lt.save();
    return successResponse(res, lt, 'Leave type updated');
  } catch (err) { next(err); }
};

// ─── Leave Balances ─────────────────────────────────────
exports.getBalances = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.staffId) filter.staffId = req.query.staffId;
    if (req.query.academicYear) filter.academicYear = req.query.academicYear;
    const balances = await LeaveBalance.find(filter)
      .populate('leaveTypeId', 'name code')
      .populate('staffId', 'firstName lastName employeeId')
      .lean();
    return successResponse(res, balances, 'Leave balances retrieved');
  } catch (err) { next(err); }
};

exports.creditLeaveBalance = async (req, res, next) => {
  try {
    const { staffId, leaveTypeId, credited, academicYear } = req.body;
    if (!staffId || !leaveTypeId || !credited || !academicYear) throw new ValidationError('staffId, leaveTypeId, credited, academicYear required');
    const balance = await LeaveBalance.findOneAndUpdate(
      { schoolId: req.schoolContext.schoolId, staffId, leaveTypeId, academicYear },
      { $inc: { credited, available: credited }, $setOnInsert: { schoolId: req.schoolContext.schoolId, staffId, leaveTypeId, academicYear } },
      { upsert: true, new: true }
    );
    await logAudit(req, 'leave_balance_credit', 'LeaveBalance', balance._id, null, { credited });
    return successResponse(res, balance, 'Leave balance credited');
  } catch (err) { next(err); }
};

// ─── Leave Requests ─────────────────────────────────────
exports.listRequests = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.staffId) filter.staffId = req.query.staffId;
    if (req.query.status) filter.status = req.query.status;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [total, requests] = await Promise.all([
      StaffLeaveRequest.countDocuments(filter),
      StaffLeaveRequest.find(filter)
        .populate('staffId', 'firstName lastName employeeId')
        .populate('leaveTypeId', 'name code')
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return successResponse(res, requests, 'Leave requests retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};

exports.submitRequest = async (req, res, next) => {
  try {
    const { leaveTypeId, fromDate, toDate, reason, handoverTo } = req.body;
    if (!leaveTypeId || !fromDate || !toDate) throw new ValidationError('leaveTypeId, fromDate, toDate required');

    // Find the staff linked to current user
    const Staff = require('../models/Staff');
    const staff = await Staff.findOne({ userId: req.user._id, schoolId: req.schoolContext.schoolId });
    if (!staff) throw new NotFoundError('Staff record not found for your account');

    const from = new Date(fromDate);
    const to = new Date(toDate);
    const duration = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;

    const request = await StaffLeaveRequest.create({
      schoolId: req.schoolContext.schoolId,
      staffId: staff._id,
      leaveTypeId, fromDate, toDate, duration, reason, handoverTo,
      status: 'PENDING',
    });
    await logAudit(req, 'staff_leave_request', 'StaffLeaveRequest', request._id, null, request.toObject());
    return successResponse(res, request, 'Leave request submitted', 201);
  } catch (err) { next(err); }
};

exports.reviewRequest = async (req, res, next) => {
  try {
    const { status, remarks } = req.body;
    if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) throw new ValidationError('Invalid status');
    const request = await StaffLeaveRequest.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!request) throw new NotFoundError('Leave request not found');
    if (!['PENDING'].includes(request.status)) throw new ForbiddenError(`Cannot review a ${request.status} request`);

    const before = request.toObject();
    request.status = status;
    request.remarks = remarks;
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    // If approved, deduct from leave balance
    if (status === 'APPROVED') {
      await LeaveBalance.findOneAndUpdate(
        { schoolId: req.schoolContext.schoolId, staffId: request.staffId, leaveTypeId: request.leaveTypeId },
        { $inc: { used: request.duration, available: -request.duration } }
      );
    }

    await logAudit(req, `staff_leave_${status.toLowerCase()}`, 'StaffLeaveRequest', request._id, before, request.toObject());
    return successResponse(res, request, `Leave request ${status.toLowerCase()}`);
  } catch (err) { next(err); }
};
