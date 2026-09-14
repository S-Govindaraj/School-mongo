const Staff = require('../models/Staff');
const User = require('../models/User');
const { successResponse } = require('../utils/response');

const getStaff = async (req, res, next) => {
  try {
    const staff = await Staff.find({}).populate('userId');
    return successResponse(res, staff, 'Staff members retrieved');
  } catch (error) {
    next(error);
  }
};

const createStaff = async (req, res, next) => {
  try {
    const staff = await Staff.create(req.body);
    return successResponse(res, staff, 'Staff created', 201);
  } catch (error) {
    next(error);
  }
};

const updateStaff = async (req, res, next) => {
  try {
    const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return successResponse(res, staff, 'Staff updated');
  } catch (error) {
    next(error);
  }
};

const deleteStaff = async (req, res, next) => {
  try {
    await Staff.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Staff deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
};
