const TeacherAssignment = require('../models/TeacherAssignment');
const { successResponse } = require('../utils/response');

const getTeacherAssignments = async (req, res, next) => {
  try {
    const list = await TeacherAssignment.find({})
      .populate('staffId')
      .populate('gradeId')
      .populate('sectionId')
      .populate('subjectId');
    return successResponse(res, list, 'Teacher assignments retrieved');
  } catch (error) {
    next(error);
  }
};

const createTeacherAssignment = async (req, res, next) => {
  try {
    const assignment = await TeacherAssignment.create(req.body);
    return successResponse(res, assignment, 'Teacher assignment created', 201);
  } catch (error) {
    next(error);
  }
};

const deleteTeacherAssignment = async (req, res, next) => {
  try {
    await TeacherAssignment.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Teacher assignment deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeacherAssignments,
  createTeacherAssignment,
  deleteTeacherAssignment,
};
