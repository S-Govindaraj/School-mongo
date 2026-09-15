const NotificationPreference = require('../models/NotificationPreference');
const { successResponse, errorResponse } = require('../utils/response');

const defaultPreferences = [
  { category: 'ATTENDANCE', inApp: true, email: true, sms: false, push: true },
  { category: 'EXAM', inApp: true, email: true, sms: false, push: true },
  { category: 'RESULT', inApp: true, email: true, sms: false, push: true },
  { category: 'FEE', inApp: true, email: true, sms: false, push: true },
  { category: 'PAYMENT', inApp: true, email: true, sms: false, push: true },
  { category: 'ANNOUNCEMENT', inApp: true, email: true, sms: false, push: true },
  { category: 'LEAVE', inApp: true, email: true, sms: false, push: true },
  { category: 'SYSTEM', inApp: true, email: true, sms: false, push: true }
];

const getNotificationPreferences = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    let pref = await NotificationPreference.findOne({ schoolId, userId });
    if (!pref) {
      pref = await NotificationPreference.create({
        schoolId,
        userId,
        preferences: defaultPreferences
      });
    }

    return successResponse(res, pref, 'Notification preferences loaded');
  } catch (error) {
    next(error);
  }
};

const updateNotificationPreferences = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { preferences } = req.body;

    if (!Array.isArray(preferences)) {
      return errorResponse(res, 'Preferences array is required', 400, 'VALIDATION_ERROR');
    }

    const pref = await NotificationPreference.findOneAndUpdate(
      { schoolId, userId },
      { preferences },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return successResponse(res, pref, 'Notification preferences updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotificationPreferences,
  updateNotificationPreferences
};
