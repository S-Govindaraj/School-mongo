const Grade = require('../models/Grade');
const { successResponse } = require('../utils/response');

const getGrades = async (req, res, next) => {
  try {
    const grades = await Grade.find({}).sort({ sequenceOrder: 1, name: 1 });
    return successResponse(res, grades, 'Grades retrieved');
  } catch (error) {
    next(error);
  }
};

const createGrade = async (req, res, next) => {
  try {
    const grade = await Grade.create(req.body);
    return successResponse(res, grade, 'Grade created', 201);
  } catch (error) {
    next(error);
  }
};

const updateGrade = async (req, res, next) => {
  try {
    const grade = await Grade.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return successResponse(res, grade, 'Grade updated');
  } catch (error) {
    next(error);
  }
};

const deleteGrade = async (req, res, next) => {
  try {
    await Grade.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Grade deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGrades,
  createGrade,
  updateGrade,
  deleteGrade,
};
