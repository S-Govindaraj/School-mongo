const School = require('../models/School');
const Campus = require('../models/Campus');
const { successResponse, errorResponse } = require('../utils/response');

const getSchoolProfile = async (req, res, next) => {
  try {
    const school = await School.findOne({});
    return successResponse(res, school, 'School profile retrieved');
  } catch (error) {
    next(error);
  }
};

const updateSchoolProfile = async (req, res, next) => {
  try {
    const school = await School.findOneAndUpdate({}, req.body, { new: true, upsert: true });
    return successResponse(res, school, 'School profile updated');
  } catch (error) {
    next(error);
  }
};

const getCampuses = async (req, res, next) => {
  try {
    const campuses = await Campus.find({}).sort({ isMain: -1, name: 1 });
    return successResponse(res, campuses, 'Campuses retrieved');
  } catch (error) {
    next(error);
  }
};

const createCampus = async (req, res, next) => {
  try {
    const campus = await Campus.create(req.body);
    return successResponse(res, campus, 'Campus created', 201);
  } catch (error) {
    next(error);
  }
};

const updateCampus = async (req, res, next) => {
  try {
    const campus = await Campus.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return successResponse(res, campus, 'Campus updated');
  } catch (error) {
    next(error);
  }
};

const deleteCampus = async (req, res, next) => {
  try {
    await Campus.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Campus deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSchoolProfile,
  updateSchoolProfile,
  getCampuses,
  createCampus,
  updateCampus,
  deleteCampus,
};
