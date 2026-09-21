const TimetableGeneratorDraft = require('../models/TimetableGeneratorDraft');
const { successResponse } = require('../utils/response');

/** GET /timetable-generator/draft — the current user's in-progress wizard
 * session, or `null` when none exists. Not a 404 — "no draft yet" is normal. */
const getTimetableGeneratorDraft = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;

    const draft = await TimetableGeneratorDraft.findOne({ schoolId, userId }).lean();

    return successResponse(res, draft || null, 'Timetable generator draft retrieved');
  } catch (error) {
    next(error);
  }
};

/** PUT /timetable-generator/draft — body {currentStep, wizardData}. Upserts
 * the caller's single draft so it can be resumed later. */
const saveTimetableGeneratorDraft = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { currentStep, wizardData } = req.body;

    const draft = await TimetableGeneratorDraft.findOneAndUpdate(
      { schoolId, userId },
      { $set: { currentStep, wizardData } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return successResponse(res, draft, 'Timetable draft saved successfully');
  } catch (error) {
    next(error);
  }
};

/** DELETE /timetable-generator/draft — clears the caller's draft (after a
 * successful final save, or an explicit "discard draft"). Idempotent. */
const deleteTimetableGeneratorDraft = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;

    await TimetableGeneratorDraft.deleteOne({ schoolId, userId });

    return successResponse(res, null, 'Timetable draft cleared');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTimetableGeneratorDraft,
  saveTimetableGeneratorDraft,
  deleteTimetableGeneratorDraft,
};
