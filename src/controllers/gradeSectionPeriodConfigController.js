const GradeSectionPeriodConfig = require('../models/GradeSectionPeriodConfig');
const Period = require('../models/Period');
const Section = require('../models/Section');
const { successResponse } = require('../utils/response');
const { ValidationError } = require('../utils/errors');

const PERIOD_POPULATE = 'name code sequence startTime endTime durationMinutes type isBreak status';

/** GET /grade-section-periods?academicYearId=&gradeId=&sectionId= — the
 * selected instructional periods for one Grade+Section in one Academic Year.
 * Returns `null` data (not a 404) when nothing has been configured yet —
 * that is a normal, expected state, not an error. */
const getGradeSectionPeriodConfig = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, gradeId, sectionId } = req.query;

    if (!academicYearId || !gradeId || !sectionId) {
      throw new ValidationError('academicYearId, gradeId and sectionId are all required.');
    }

    const config = await GradeSectionPeriodConfig.findOne({ schoolId, academicYearId, gradeId, sectionId })
      .populate('periodIds', PERIOD_POPULATE)
      .lean();

    return successResponse(res, config || null, 'Grade/section period configuration retrieved');
  } catch (error) {
    next(error);
  }
};

/** PUT /grade-section-periods — body {academicYearId, gradeId, sectionId, periodIds:[]}.
 * Upserts the selection. Only ACTIVE, INSTRUCTIONAL periods may be selected —
 * Break/Recess/Lunch periods can never become timetable subject slots. */
const saveGradeSectionPeriodConfig = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, gradeId, sectionId, periodIds = [] } = req.body;

    if (!academicYearId || !gradeId || !sectionId) {
      throw new ValidationError('academicYearId, gradeId and sectionId are all required.');
    }

    const section = await Section.findOne({ _id: sectionId, schoolId, gradeId });
    if (!section) {
      throw new ValidationError('Selected section does not belong to the selected grade in this school.');
    }

    const uniqueIds = [...new Set((periodIds || []).map(String))];
    if (uniqueIds.length > 0) {
      const validPeriods = await Period.find({
        _id: { $in: uniqueIds },
        schoolId,
        type: 'INSTRUCTIONAL',
        status: 'ACTIVE',
      }).select('_id').lean();

      if (validPeriods.length !== uniqueIds.length) {
        throw new ValidationError('One or more selected periods are not valid active instructional periods for this school.');
      }
    }

    const config = await GradeSectionPeriodConfig.findOneAndUpdate(
      { schoolId, academicYearId, gradeId, sectionId },
      { $set: { periodIds: uniqueIds, updatedBy: req.user?._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate('periodIds', PERIOD_POPULATE);

    return successResponse(res, config, 'Period selection saved successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGradeSectionPeriodConfig,
  saveGradeSectionPeriodConfig,
};
