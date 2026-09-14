const AcademicYear = require('../models/AcademicYear');
const { successResponse } = require('../utils/response');

const getAcademicYears = async (req, res, next) => {
  try {
    const years = await AcademicYear.find({}).sort({ startDate: -1 });
    return successResponse(res, years, 'Academic years retrieved');
  } catch (error) {
    next(error);
  }
};

const getCurrentAcademicYear = async (req, res, next) => {
  try {
    const current = await AcademicYear.findOne({ isCurrent: true });
    return successResponse(res, current, 'Current academic year retrieved');
  } catch (error) {
    next(error);
  }
};

const createAcademicYear = async (req, res, next) => {
  try {
    const year = await AcademicYear.create(req.body);
    return successResponse(res, year, 'Academic year created', 201);
  } catch (error) {
    next(error);
  }
};

const updateAcademicYear = async (req, res, next) => {
  try {
    const year = await AcademicYear.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return successResponse(res, year, 'Academic year updated');
  } catch (error) {
    next(error);
  }
};

const setCurrentAcademicYear = async (req, res, next) => {
  try {
    await AcademicYear.updateMany({}, { isCurrent: false });
    const current = await AcademicYear.findByIdAndUpdate(req.params.id, { isCurrent: true }, { new: true });
    return successResponse(res, current, 'Set current academic year');
  } catch (error) {
    next(error);
  }
};

const deleteAcademicYear = async (req, res, next) => {
  try {
    await AcademicYear.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Academic year deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAcademicYears,
  getCurrentAcademicYear,
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
  deleteAcademicYear,
};
