const ClassSubject = require('../models/ClassSubject');
const { successResponse } = require('../utils/response');

const getClassSubjects = async (req, res, next) => {
  try {
    const list = await ClassSubject.find({}).populate('gradeId').populate('subjectId').populate('academicYearId');
    return successResponse(res, list, 'Class subjects retrieved');
  } catch (error) {
    next(error);
  }
};

const createClassSubject = async (req, res, next) => {
  try {
    const record = await ClassSubject.create(req.body);
    return successResponse(res, record, 'Class subject created', 201);
  } catch (error) {
    next(error);
  }
};

const saveBulkClassSubjects = async (req, res, next) => {
  try {
    const { items = [] } = req.body;
    const records = await ClassSubject.insertMany(items);
    return successResponse(res, records, 'Bulk class subjects saved', 201);
  } catch (error) {
    next(error);
  }
};

const updateClassSubject = async (req, res, next) => {
  try {
    const record = await ClassSubject.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return successResponse(res, record, 'Class subject updated');
  } catch (error) {
    next(error);
  }
};

const deleteClassSubject = async (req, res, next) => {
  try {
    await ClassSubject.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Class subject deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getClassSubjects,
  createClassSubject,
  saveBulkClassSubjects,
  updateClassSubject,
  deleteClassSubject,
};
