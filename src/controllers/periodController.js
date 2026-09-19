const Period = require('../models/Period');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');

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
    const { name, code, sequence, startTime, endTime, durationMinutes, isBreak } = req.body;

    const existing = await Period.findOne({ schoolId, code: String(code || '').trim(), status: { $ne: 'ARCHIVED' } });
    if (existing) throw new ValidationError('Period code already exists in this school');

    const period = await Period.create({
      schoolId,
      name: String(name || '').trim(),
      code: String(code || '').trim(),
      sequence: Number(sequence) || 1,
      startTime: String(startTime || '').trim(),
      endTime: String(endTime || '').trim(),
      durationMinutes: Number(durationMinutes) || 45,
      isBreak: Boolean(isBreak),
      status: 'ACTIVE',
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

    Object.assign(period, req.body);
    await period.save();

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

    period.status = 'ARCHIVED';
    await period.save();

    return successResponse(res, null, 'Period archived successfully');
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

    return successResponse(res, period, 'Period restored successfully');
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
