const AcademicTerm = require('../models/AcademicTerm');
const { successResponse } = require('../utils/response');

const getAcademicTerms = async (req, res, next) => {
  try {
    const terms = await AcademicTerm.find({}).populate('academicYearId');
    return successResponse(res, terms, 'Academic terms retrieved');
  } catch (error) {
    next(error);
  }
};

const createAcademicTerm = async (req, res, next) => {
  try {
    const term = await AcademicTerm.create(req.body);
    return successResponse(res, term, 'Academic term created', 201);
  } catch (error) {
    next(error);
  }
};

const updateAcademicTerm = async (req, res, next) => {
  try {
    const term = await AcademicTerm.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return successResponse(res, term, 'Academic term updated');
  } catch (error) {
    next(error);
  }
};

const deleteAcademicTerm = async (req, res, next) => {
  try {
    await AcademicTerm.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Academic term deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAcademicTerms,
  createAcademicTerm,
  updateAcademicTerm,
  deleteAcademicTerm,
};
