// DB-aware layer for configurable grading. Resolves thresholds from
// SchoolSetting.examination.gradingThresholds (or fallback legacy Setting)
// and hands it to the PURE resultCalculationService.
const SchoolSetting = require('../models/SchoolSetting');
const Setting = require('../models/Setting');
const { GRADE_THRESHOLDS } = require('./resultCalculationService');

const getThresholds = async (schoolId) => {
  if (schoolId) {
    try {
      const doc = await SchoolSetting.findOne({ schoolId }).lean();
      if (doc?.examination?.gradingThresholds?.length > 0) {
        const valid = doc.examination.gradingThresholds.every(
          (t) => typeof t.min === 'number' && typeof t.grade === 'string'
        );
        if (valid) {
          return doc.examination.gradingThresholds.slice().sort((a, b) => b.min - a.min);
        }
      }
    } catch (_) {
      // Fall through to legacy check
    }

    try {
      const setting = await Setting.findOne({ schoolId, category: 'examination', key: 'grading.thresholds' }).lean();
      if (setting && setting.value) {
        const parsed = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((t) => typeof t.min === 'number' && typeof t.grade === 'string')) {
          return parsed.slice().sort((a, b) => b.min - a.min);
        }
      }
    } catch (_) {
      // fall through to default
    }
  }

  return GRADE_THRESHOLDS;
};

module.exports = { getThresholds };
