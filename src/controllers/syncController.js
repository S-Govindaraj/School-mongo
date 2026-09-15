const syncService = require('../services/syncService');
const MobileDevice = require('../models/MobileDevice');
const Timetable = require('../models/Timetable');
const Announcement = require('../models/Announcement');
const AttendanceSession = require('../models/AttendanceSession');
const Notification = require('../models/Notification');
const { successResponse } = require('../utils/response');

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
    const today = new Date().toISOString().slice(0, 10);

    const [announcements, unreadNotifications, activeSessions] = await Promise.all([
      Announcement.find({ schoolId, status: 'PUBLISHED' }).sort({ publishedAt: -1 }).limit(3),
      Notification.countDocuments({ schoolId, recipientId: userId, isRead: false }),
      AttendanceSession.find({ schoolId, sessionDate: today }).limit(5)
    ]);

    return successResponse(res, {
      role: userRole,
      today,
      unreadNotifications,
      announcements,
      activeSessions: activeSessions.map(s => ({
        id: s._id,
        sectionId: s.sectionId,
        isLocked: s.isLocked
      }))
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
