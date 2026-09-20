const Period = require('../models/Period');
const Timetable = require('../models/Timetable');
const AttendanceRecord = require('../models/AttendanceRecord');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const calculateDuration = (start, end) => {
  const [sH, sM] = start.split(':').map(Number);
  const [eH, eM] = end.split(':').map(Number);
  return (eH * 60 + eM) - (sH * 60 + sM);
};

const validatePeriod = async (schoolId, data, currentId = null) => {
  const { name, code, sequence, startTime, endTime } = data;

  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new ValidationError('Period name is required.');

  const formattedCode = String(code || '').trim().toUpperCase();
  if (!formattedCode) throw new ValidationError('Period code is required.');

  const seqNum = Number(sequence);
  if (!Number.isInteger(seqNum) || seqNum <= 0) {
    throw new ValidationError('Period sequence must be a positive integer.');
  }

  const sTime = String(startTime || '').trim();
  const eTime = String(endTime || '').trim();
  if (!sTime || !eTime) {
    throw new ValidationError('Start time and end time are required.');
  }
  if (sTime >= eTime) {
    throw new ValidationError('Start time must be before end time.');
  }

  // Check code uniqueness
  const codeQuery = { schoolId, code: formattedCode, status: { $ne: 'ARCHIVED' } };
  if (currentId) codeQuery._id = { $ne: currentId };
  const existingCode = await Period.findOne(codeQuery);
  if (existingCode) {
    throw new ValidationError(`Period code '${formattedCode}' already exists in this school.`);
  }

  // Check sequence uniqueness
  const seqQuery = { schoolId, sequence: seqNum, status: { $ne: 'ARCHIVED' } };
  if (currentId) seqQuery._id = { $ne: currentId };
  const existingSeq = await Period.findOne(seqQuery);
  if (existingSeq) {
    throw new ValidationError(`Period sequence '${seqNum}' is already assigned to period '${existingSeq.name}'.`);
  }

  // Check name uniqueness
  const nameQuery = { schoolId, name: trimmedName, status: { $ne: 'ARCHIVED' } };
  if (currentId) nameQuery._id = { $ne: currentId };
  const existingName = await Period.findOne(nameQuery);
  if (existingName) {
    throw new ValidationError(`Period name '${trimmedName}' already exists in this school.`);
  }

  // Check timing overlap with other active periods in school
  const overlapQuery = {
    schoolId,
    status: { $ne: 'ARCHIVED' },
    $or: [
      { startTime: { $lt: eTime, $gte: sTime } },
      { endTime: { $gt: sTime, $lte: eTime } },
      { startTime: { $lte: sTime }, endTime: { $gte: eTime } },
    ],
  };
  if (currentId) overlapQuery._id = { $ne: currentId };
  const overlapping = await Period.findOne(overlapQuery);
  if (overlapping) {
    throw new ValidationError(
      `Period timings overlap with existing period '${overlapping.name}' (${overlapping.startTime} - ${overlapping.endTime}).`
    );
  }
};

const getPeriods = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, includeArchived } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }

    const periods = await Period.find(filter).sort({ sequence: 1 });
    return successResponse(res, periods, 'Periods retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createPeriod = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    await validatePeriod(schoolId, req.body);

    const { name, code, sequence, startTime, endTime, isBreak = false, status: requestedStatus } = req.body;

    const sTime = String(startTime).trim();
    const eTime = String(endTime).trim();
    const duration = calculateDuration(sTime, eTime);

    const status = requestedStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';

    const period = await Period.create({
      schoolId,
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      sequence: Number(sequence),
      startTime: sTime,
      endTime: eTime,
      durationMinutes: duration,
      isBreak: Boolean(isBreak),
      status,
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'CREATE',
      entity: 'Period',
      entityId: period._id.toString(),
      newValues: period.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, period, 'Period created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updatePeriod = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const period = await Period.findOne({ _id: id, schoolId });
    if (!period) throw new NotFoundError('Period not found');

    const merged = { ...period.toObject(), ...req.body };
    await validatePeriod(schoolId, merged, id);

    const oldValues = period.toObject();
    Object.assign(period, req.body);
    if (period.startTime && period.endTime) {
      period.durationMinutes = calculateDuration(period.startTime, period.endTime);
    }
    await period.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'UPDATE',
      entity: 'Period',
      entityId: period._id.toString(),
      oldValues,
      newValues: period.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, period, 'Period updated successfully');
  } catch (error) {
    next(error);
  }
};

const deletePeriod = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const period = await Period.findOne({ _id: id, schoolId });
    if (!period) throw new NotFoundError('Period not found');

    const [hasTimetable, hasAttendance] = await Promise.all([
      Timetable.countDocuments({ schoolId, periodId: id, status: { $ne: 'ARCHIVED' } }),
      AttendanceRecord.countDocuments({ schoolId, periodId: id }),
    ]);

    if (hasTimetable > 0 || hasAttendance > 0) {
      throw new ValidationError(
        'This period cannot be deleted because active timetable slots or attendance records reference it.'
      );
    }

    period.status = 'INACTIVE';
    await period.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'Period',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Period deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restorePeriod = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const period = await Period.findOne({ _id: id, schoolId });
    if (!period) throw new NotFoundError('Period not found');

    period.status = 'ACTIVE';
    await period.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'Period',
      entityId: period._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, period, 'Period activated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPeriods,
  createPeriod,
  updatePeriod,
  deletePeriod,
  restorePeriod,
};
