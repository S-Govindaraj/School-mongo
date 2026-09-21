const { successResponse } = require('../utils/response');
const { TimetableGeneratorService } = require('../services/timetableGeneratorService');

const previewGeneration = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const result = await TimetableGeneratorService.previewGeneration(schoolId, req.body);
    return successResponse(res, result, 'Timetable generated successfully');
  } catch (error) {
    next(error);
  }
};

const saveGeneration = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const created = await TimetableGeneratorService.saveGeneration(schoolId, req.body, req.user);
    return successResponse(res, { count: created.length }, 'Generated timetable saved successfully', 201);
  } catch (error) {
    next(error);
  }
};

module.exports = { previewGeneration, saveGeneration };
