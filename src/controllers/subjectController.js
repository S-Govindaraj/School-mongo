const Subject = require('../models/Subject');
const { successResponse } = require('../utils/response');

const getSubjects = async (req, res, next) => {
  try {
    const subjects = await Subject.find({}).sort({ name: 1 });
    return successResponse(res, subjects, 'Subjects retrieved');
  } catch (error) {
    next(error);
  }
};

const createSubject = async (req, res, next) => {
  try {
    const subject = await Subject.create(req.body);
    return successResponse(res, subject, 'Subject created', 201);
  } catch (error) {
    next(error);
  }
};

const updateSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return successResponse(res, subject, 'Subject updated');
  } catch (error) {
    next(error);
  }
};

const deleteSubject = async (req, res, next) => {
  try {
    await Subject.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Subject deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
};
