/**
 * Phase 8 — Staff Attendance Controller (HRMS)
 */
const StaffAttendance = require('../models/StaffAttendance');
const Staff = require('../models/Staff');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

exports.list = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.staffId) filter.staffId = req.query.staffId;
    if (req.query.date) filter.date = req.query.date;
    if (req.query.month) filter.date = { $regex: `^${req.query.month}` }; // YYYY-MM
    if (req.query.status) filter.status = req.query.status;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const [total, records] = await Promise.all([
      StaffAttendance.countDocuments(filter),
      StaffAttendance.find(filter)
        .populate('staffId', 'firstName lastName employeeId')
        .sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return successResponse(res, records, 'Staff attendance retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};

exports.markAttendance = async (req, res, next) => {
  try {
    const { staffId, date, status, checkIn, checkOut, remarks } = req.body;
    if (!staffId || !date || !status) throw new ValidationError('staffId, date, status are required');
    const staff = await Staff.findOne({ _id: staffId, schoolId: req.schoolContext.schoolId });
    if (!staff) throw new NotFoundError('Staff not found');
    const existing = await StaffAttendance.findOne({ staffId, date, schoolId: req.schoolContext.schoolId });
    if (existing) {
      existing.status = status;
      existing.checkIn = checkIn;
      existing.checkOut = checkOut;
      existing.remarks = remarks;
      existing.markedBy = req.user._id;
      await existing.save();
      await logAudit(req, 'staff_attendance_update', 'StaffAttendance', existing._id, null, existing.toObject());
      return successResponse(res, existing, 'Attendance updated');
    }
    const record = await StaffAttendance.create({
      schoolId: req.schoolContext.schoolId,
      staffId, date, status, checkIn, checkOut, remarks,
      markedBy: req.user._id,
    });
    await logAudit(req, 'staff_attendance_mark', 'StaffAttendance', record._id, null, record.toObject());
    return successResponse(res, record, 'Attendance marked', 201);
  } catch (err) { next(err); }
};

exports.bulkMark = async (req, res, next) => {
  try {
    const { date, records } = req.body;
    if (!date || !Array.isArray(records) || !records.length) {
      throw new ValidationError('date and records[] are required');
    }
    const ops = records.map((r) => ({
      updateOne: {
        filter: { staffId: r.staffId, date, schoolId: req.schoolContext.schoolId },
        update: { $set: { ...r, date, schoolId: req.schoolContext.schoolId, markedBy: req.user._id } },
        upsert: true,
      },
    }));
    const result = await StaffAttendance.bulkWrite(ops);
    await logAudit(req, 'staff_attendance_bulk_mark', 'StaffAttendance', null, null, { date, count: records.length });
    return successResponse(res, { matched: result.matchedCount, upserted: result.upsertedCount }, 'Bulk attendance marked');
  } catch (err) { next(err); }
};

exports.getStaffSummary = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { month } = req.query; // YYYY-MM
    if (!month) throw new ValidationError('month (YYYY-MM) is required');
    const records = await StaffAttendance.find({
      staffId,
      schoolId: req.schoolContext.schoolId,
      date: { $regex: `^${month}` },
    }).lean();
    const summary = { total: records.length, PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, LEAVE: 0, HOLIDAY: 0 };
    records.forEach((r) => { if (summary[r.status] !== undefined) summary[r.status]++; });
    return successResponse(res, { summary, records }, 'Attendance summary retrieved');
  } catch (err) { next(err); }
};
