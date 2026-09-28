const syncService = require('../services/syncService');
const MobileDevice = require('../models/MobileDevice');
const Timetable = require('../models/Timetable');
const Announcement = require('../models/Announcement');
const AttendanceDay = require('../models/AttendanceDay');
const Notification = require('../models/Notification');
const { successResponse } = require('../utils/response');
const { resolveAttendanceScope, applyScopeToFilter } = require('../services/attendanceScopeService');

// ─── Sync Mutations ──────────────────────────────────────────
const syncMutations = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { mutations = [] } = req.body;

    const result = await syncService.processMutations({
      schoolId,
      userId,
      actor: req.user,
      mutations,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return successResponse(res, result, 'Mutations synchronization processed');
  } catch (err) {
    next(err);
  }
};

// ─── Sync Status ─────────────────────────────────────────────
const getSyncStatus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;

    return successResponse(res, {
      serverTime: new Date().toISOString(),
      status: 'HEALTHY',
      schoolId,
      userId
    }, 'Sync status retrieved');
  } catch (err) {
    next(err);
  }
};

// ─── Device Registration & Push Token ────────────────────────
const registerDevice = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { deviceId, platform, pushToken, appVersion, deviceName } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }

    const device = await MobileDevice.findOneAndUpdate(
      { schoolId, userId, deviceId },
      {
        platform: platform || 'WEB_PWA',
        pushToken: pushToken || null,
        appVersion: appVersion || '1.0.0',
        deviceName: deviceName || 'PWA Client',
        lastSeenAt: new Date(),
        status: 'ACTIVE'
      },
      { upsert: true, new: true }
    );

    return successResponse(res, device, 'Device registered successfully', 201);
  } catch (err) {
    next(err);
  }
};

const getDevices = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;

    const devices = await MobileDevice.find({ schoolId, userId, status: 'ACTIVE' }).sort({ lastSeenAt: -1 });
    return successResponse(res, devices, 'Active user devices retrieved');
  } catch (err) {
    next(err);
  }
};

const revokeDevice = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;

    const device = await MobileDevice.findOneAndUpdate(
      { _id: id, schoolId, userId },
      { status: 'REVOKED' },
      { new: true }
    );

    return successResponse(res, device, 'Device session revoked');
  } catch (err) {
    next(err);
  }
};

// ─── Aggregated Mobile Dashboard ──────────────────────────────
const getMobileDashboard = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const userId = req.user?._id;
    const userRole = req.user?.role?.name || 'STUDENT';
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Fixed: previously queried `sessionDate`/`isLocked`, neither of which
    // exist on the real schema (an always-empty read) — now scoped to the
    // caller's own section(s) via attendanceScopeService, same as the main
    // /attendance/roster endpoint.
    const scope = await resolveAttendanceScope(req);
    const dayFilter = { schoolId, date: { $gte: startOfToday, $lte: endOfToday } };
    applyScopeToFilter(dayFilter, scope);

    const [announcements, unreadNotifications, todaySections] = await Promise.all([
      Announcement.find({ schoolId, status: 'PUBLISHED' }).sort({ publishedAt: -1 }).limit(3),
      Notification.countDocuments({ schoolId, recipientId: userId, isRead: false }),
      AttendanceDay.find(dayFilter).select('sectionId periods.sessionStatus').limit(5).lean(),
    ]);

    return successResponse(res, {
      role: userRole,
      today: startOfToday.toISOString().slice(0, 10),
      unreadNotifications,
      announcements,
      activeSessions: todaySections.map((d) => ({
        id: d._id,
        sectionId: d.sectionId,
        isLocked: (d.periods || []).length > 0 && d.periods.every((p) => p.sessionStatus === 'LOCKED'),
      })),
    }, 'Mobile dashboard aggregation retrieved');
  } catch (err) {
    next(err);
  }
};

// ─── Mobile Configuration & Feature Flags ─────────────────────
const getMobileConfig = async (req, res, next) => {
  try {
    return successResponse(res, {
      minimumSupportedVersion: '1.0.0',
      latestVersion: '1.0.0',
      recommendedVersion: '1.0.0',
      features: {
        offlineAttendance: true,
        qrScanning: true,
        documentCapture: true,
        pushNotifications: true,
        backgroundSync: true
      }
    }, 'Mobile configuration retrieved');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  syncMutations,
  getSyncStatus,
  registerDevice,
  getDevices,
  revokeDevice,
  getMobileDashboard,
  getMobileConfig
};
