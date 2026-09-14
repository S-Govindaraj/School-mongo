const Setting = require('../models/Setting');
const { successResponse } = require('../utils/response');

const getSettings = async (req, res, next) => {
  try {
    const settings = await Setting.find({});
    return successResponse(res, settings, 'Settings retrieved');
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const { settings = [] } = req.body;
    for (const item of settings) {
      await Setting.findOneAndUpdate(
        { category: item.category, key: item.key },
        { value: item.value, description: item.description },
        { upsert: true, new: true }
      );
    }
    const updated = await Setting.find({});
    return successResponse(res, updated, 'Settings updated');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
};
