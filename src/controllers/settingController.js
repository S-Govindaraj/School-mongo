const SchoolSetting = require('../models/SchoolSetting');
const Setting = require('../models/Setting');
const { successResponse } = require('../utils/response');
const { ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

/**
 * Helper to ensure a SchoolSetting document exists for the school.
 * If legacy Setting rows exist, migrates known values into the new structured document.
 */
const getOrCreateSchoolSetting = async (schoolId) => {
  if (!schoolId) return null;

  let doc = await SchoolSetting.findOne({ schoolId });
  if (doc) return doc;

  // Check legacy settings for pre-existing values to preserve
  const legacyRows = await Setting.find({ schoolId }).lean();
  const legacyMap = {};
  legacyRows.forEach((r) => {
    legacyMap[`${r.category}:${r.key}`] = r.value;
    legacyMap[r.key] = r.value;
  });

  const initialPayload = {
    schoolId,
    academic: {
      academicYearFormat: legacyMap['school:academic.year.format'] || legacyMap['academic.year.format'] || 'YYYY-YY',
      dateFormat: legacyMap['date_format'] || 'DD/MM/YYYY',
      timeFormat: '12_HOUR',
      weekStartDay: 'MONDAY',
      workingDaysPerWeek: 6,
      periodDurationMinutes: 45,
      dailyPeriodsCount: 8,
    },
    attendance: {
      mode: legacyMap['attendance:attendance.mode'] === 'DAILY' ? 'DAILY_ONCE' : (legacyMap['attendance_mode'] || 'DAILY_ONCE'),
      allowBackdated: legacyMap['attendance:attendance.allowBackdated'] !== 'false',
      backdateLimitDays: 3,
      lowAttendanceThreshold: 75,
      notifyAbsenceToParents: true,
      enableStaffAttendance: true,
    },
    student: {
      idPrefix: legacyMap['student:student.number.prefix'] || 'STU-',
      idFormat: legacyMap['student_number_format'] || 'STU-{YYYY}-{SEQ}',
      admissionPrefix: 'ADM-',
      idGeneration: legacyMap['student:student.number.format'] || 'AUTO_INCREMENT',
      defaultStatus: 'ACTIVE',
      autoCreateUserAccount: true,
    },
    examination: {
      gradingMode: legacyMap['examination:grading.mode'] || legacyMap['grading_mode'] || 'PERCENTAGE',
      allowDecimalMarks: legacyMap['examination:marks.decimalAllowed'] === 'true',
      passingPercentage: 35,
      showRankOnReportCard: true,
      gradingThresholds: SchoolSetting.DEFAULT_GRADING_THRESHOLDS,
    },
    fees: {
      currency: legacyMap['fees:fee.currency'] || 'INR',
      invoicePrefix: legacyMap['fees:invoicePrefix'] || 'INV-',
      receiptPrefix: legacyMap['fees:receiptPrefix'] || 'RCP-',
      paymentDueDays: 15,
      lateFeeGracePeriodDays: 5,
      autoGenerateInvoiceOnTerm: false,
    },
    security: {
      sessionTimeoutMinutes: 30,
      enforce2FA: false,
      emailNotificationsEnabled: true,
      smsNotificationsEnabled: false,
    },
  };

  // If legacy grading thresholds exist as JSON, parse and preserve them
  if (legacyMap['examination:grading.thresholds']) {
    try {
      const parsed = JSON.parse(legacyMap['examination:grading.thresholds']);
      if (Array.isArray(parsed) && parsed.length > 0) {
        initialPayload.examination.gradingThresholds = parsed;
      }
    } catch (_) {}
  }

  doc = await SchoolSetting.create(initialPayload);
  return doc;
};

/**
 * GET /api/v1/settings
 * Retrieves the complete structured SchoolSetting document.
 */
const getSettings = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId || req.user?.schoolId;
    const settings = await getOrCreateSchoolSetting(schoolId);

    return successResponse(res, settings, 'School settings retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/settings
 * Updates school settings. Accepts either:
 * 1. Structured object { academic, attendance, student, examination, fees, security }
 * 2. Legacy array { settings: [ { category, key, value } ] }
 */
const updateSettings = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId || req.user?.schoolId;
    if (!schoolId) throw new ValidationError('School context missing.');

    let doc = await getOrCreateSchoolSetting(schoolId);
    const body = req.body || {};

    let updateData = {};

    // Check if body is legacy array
    if (Array.isArray(body.settings)) {
      body.settings.forEach(({ category, key, value }) => {
        // Map legacy keys to structured fields
        if (key === 'student_number_format') updateData['student.idFormat'] = value;
        else if (key === 'attendance_mode') updateData['attendance.mode'] = value;
        else if (key === 'grading_mode') updateData['examination.gradingMode'] = value;
        else if (key === 'date_format') updateData['academic.dateFormat'] = value;
        else if (category === 'examination' && key === 'grading.thresholds') {
          try {
            updateData['examination.gradingThresholds'] = typeof value === 'string' ? JSON.parse(value) : value;
          } catch (_) {}
        }
      });
    } else {
      // Structured payload
      const allowedCategories = ['academic', 'attendance', 'student', 'examination', 'fees', 'security'];
      allowedCategories.forEach((cat) => {
        if (body[cat] && typeof body[cat] === 'object') {
          Object.keys(body[cat]).forEach((k) => {
            updateData[`${cat}.${k}`] = body[cat][k];
          });
        }
      });
    }

    if (Object.keys(updateData).length === 0) {
      return successResponse(res, doc, 'No settings modified');
    }

    const updated = await SchoolSetting.findOneAndUpdate(
      { schoolId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    // Also sync critical values into legacy Setting model so older code keeps working
    if (updateData['student.idPrefix']) {
      await Setting.findOneAndUpdate(
        { schoolId, category: 'student', key: 'student.number.prefix' },
        { value: updateData['student.idPrefix'] },
        { upsert: true }
      );
    }
    if (updateData['fees.invoicePrefix']) {
      await Setting.findOneAndUpdate(
        { schoolId, category: 'fees', key: 'invoicePrefix' },
        { value: updateData['fees.invoicePrefix'] },
        { upsert: true }
      );
    }
    if (updateData['fees.receiptPrefix']) {
      await Setting.findOneAndUpdate(
        { schoolId, category: 'fees', key: 'receiptPrefix' },
        { value: updateData['fees.receiptPrefix'] },
        { upsert: true }
      );
    }
    if (updateData['fees.currency']) {
      await Setting.findOneAndUpdate(
        { schoolId, category: 'fees', key: 'fee.currency' },
        { value: updateData['fees.currency'] },
        { upsert: true }
      );
    }
    if (updateData['examination.gradingThresholds']) {
      await Setting.findOneAndUpdate(
        { schoolId, category: 'examination', key: 'grading.thresholds' },
        { value: JSON.stringify(updateData['examination.gradingThresholds']) },
        { upsert: true }
      );
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'UPDATE',
      entity: 'SchoolSetting',
      details: { modifiedKeys: Object.keys(updateData) },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, updated, 'School settings updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/settings/reset
 * Resets settings to system defaults
 */
const resetSettings = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId || req.user?.schoolId;
    if (!schoolId) throw new ValidationError('School context missing.');

    await SchoolSetting.deleteOne({ schoolId });
    const fresh = await getOrCreateSchoolSetting(schoolId);

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'RESET',
      entity: 'SchoolSetting',
      details: { reset: true },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, fresh, 'School settings reset to defaults');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  resetSettings,
  getOrCreateSchoolSetting,
};
