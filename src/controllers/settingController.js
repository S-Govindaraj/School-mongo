const Setting = require('../models/Setting');
const { successResponse } = require('../utils/response');
const { ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const defaultSchoolSettings = [
  { category: 'school', key: 'academic.year.format', value: 'YYYY-YY', description: 'Academic year format' },
  { category: 'attendance', key: 'attendance.mode', value: 'DAILY', description: 'Attendance recording mode (DAILY, SUBJECT_WISE)' },
  { category: 'attendance', key: 'attendance.allowBackdated', value: 'true', description: 'Allow backdated attendance entry' },
  { category: 'examination', key: 'grading.mode', value: 'MARKS_AND_GRADES', description: 'Examination grading mode' },
  { category: 'examination', key: 'marks.decimalAllowed', value: 'false', description: 'Allow decimal marks' },
  { category: 'fees', key: 'fee.currency', value: 'INR', description: 'Default fee currency' },
  { category: 'fees', key: 'invoicePrefix', value: 'INV-', description: 'Fee invoice number prefix' },
  { category: 'fees', key: 'receiptPrefix', value: 'RCP-', description: 'Payment receipt prefix' },
  { category: 'student', key: 'student.number.prefix', value: 'STU-', description: 'Student registration number prefix' },
  { category: 'student', key: 'student.number.format', value: 'AUTO_INCREMENT', description: 'Student ID generation format' },
];

const getSettings = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    let settings = await Setting.find({ schoolId });

    if (settings.length === 0 && schoolId) {
      const initialized = defaultSchoolSettings.map((s) => ({
        ...s,
        schoolId,
      }));
      settings = await Setting.insertMany(initialized);
    }

    return successResponse(res, settings, 'School settings retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { settings = [] } = req.body;

    if (!Array.isArray(settings)) {
      throw new ValidationError('Settings payload must be an array.');
    }

    const updatedSettings = [];
    for (const item of settings) {
      const { category, key, value, description = '' } = item;
      const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      const updated = await Setting.findOneAndUpdate(
        { schoolId, category, key },
        { value: strValue, description },
        { upsert: true, new: true }
      );
      updatedSettings.push(updated);
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UPDATE',
      entity: 'Setting',
      details: { count: updatedSettings.length },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const allSettings = await Setting.find({ schoolId });
    return successResponse(res, allSettings, 'School settings updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
};
