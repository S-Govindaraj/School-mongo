const Section = require('../models/Section');
const { successResponse } = require('../utils/response');

const getSections = async (req, res, next) => {
  try {
    const sections = await Section.find({}).populate('gradeId');
    return successResponse(res, sections, 'Sections retrieved');
  } catch (error) {
    next(error);
  }
};

const createSection = async (req, res, next) => {
  try {
    const section = await Section.create(req.body);
    return successResponse(res, section, 'Section created', 201);
  } catch (error) {
    next(error);
  }
};

const updateSection = async (req, res, next) => {
  try {
    const section = await Section.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return successResponse(res, section, 'Section updated');
  } catch (error) {
    next(error);
  }
};

const deleteSection = async (req, res, next) => {
  try {
    await Section.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Section deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSections,
  createSection,
  updateSection,
  deleteSection,
};
