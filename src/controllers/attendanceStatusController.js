const AttendanceStatus = require('../models/AttendanceStatus');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');

const getAttendanceStatuses = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const statuses = await AttendanceStatus.find({ schoolId, status: { $ne: 'ARCHIVED' } }).sort({ sequence: 1 });
    return successResponse(res, statuses, 'Attendance statuses retrieved');
  } catch (error) {
    next(error);
  }
};

const createAttendanceStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { name, code, shortCode, countsAsPresent, countsAsAbsent, requiresReason, colorToken, sequence } = req.body;

    const existing = await AttendanceStatus.findOne({ schoolId, code: String(code || '').trim(), status: { $ne: 'ARCHIVED' } });
    if (existing) throw new ValidationError('Attendance status code already exists');

    const statusObj = await AttendanceStatus.create({
      schoolId,
      name: String(name || '').trim(),
      code: String(code || '').trim(),
      shortCode: String(shortCode || '').trim(),
      countsAsPresent: Boolean(countsAsPresent),
      countsAsAbsent: Boolean(countsAsAbsent),
      requiresReason: Boolean(requiresReason),
      colorToken: String(colorToken || 'emerald').trim(),
      sequence: Number(sequence) || 1,
      status: 'ACTIVE',
    });

    return successResponse(res, statusObj, 'Attendance status created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateAttendanceStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const statusObj = await AttendanceStatus.findOne({ _id: id, schoolId });
    if (!statusObj) throw new NotFoundError('Attendance status not found');

    Object.assign(statusObj, req.body);
    await statusObj.save();

    return successResponse(res, statusObj, 'Attendance status updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAttendanceStatuses,
  createAttendanceStatus,
  updateAttendanceStatus,
};
