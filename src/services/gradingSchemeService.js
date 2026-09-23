// DB-aware layer for Phase 2 configurable grading. Resolves a thresholds array
// from Setting({category:'examination', key:'grading.thresholds'}) and hands
// it to the PURE resultCalculationService (which never imports Setting).
const Setting = require('../models/Setting');
const { GRADE_THRESHOLDS } = require('./resultCalculationService');

// Setting.value is a required String field — settingController.updateSettings
// JSON.stringify()s non-string values before saving, so an array/object value
// round-trips as a JSON string here. schoolId/category/key/value confirmed
// against src/models/Setting.js.
const getThresholds = async (schoolId) => {
  const setting = await Setting.findOne({ schoolId, category: 'examination', key: 'grading.thresholds' }).lean();
  if (!setting || !setting.value) return GRADE_THRESHOLDS;
  try {
    const parsed = JSON.parse(setting.value);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((t) => typeof t.min === 'number' && typeof t.grade === 'string')) {
      return parsed.slice().sort((a, b) => b.min - a.min);
    }
  } catch (_) {
    // fall through to default
  }
  return GRADE_THRESHOLDS;
};

module.exports = { getThresholds };
