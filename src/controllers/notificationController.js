const Notification = require('../models/Notification');
const { successResponse, errorResponse } = require('../utils/response');

const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { status, category, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { recipientUserId: userId };
    if (status && status !== 'ALL') query.status = status;
    if (category && category !== 'ALL') query.category = category;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Notification.countDocuments(query),
      Notification.countDocuments({ recipientUserId: userId, status: 'UNREAD' })
    ]);

    return successResponse(res, notifications, 'Notifications fetched successfully', 200, {
      page: pageNum,
      limit: limitNum,
      total,
      unreadCount,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
};

const getUnreadNotificationCount = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const unreadCount = await Notification.countDocuments({ recipientUserId: userId, status: 'UNREAD' });
    return successResponse(res, { unreadCount }, 'Unread count fetched');
  } catch (error) {
    next(error);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const notification = await Notification.findOne({ _id: id, recipientUserId: userId });
    if (!notification) {
      return errorResponse(res, 'Notification not found', 404, 'NOT_FOUND');
    }

    notification.status = 'READ';
    notification.readAt = new Date();
    await notification.save();

    return successResponse(res, notification, 'Notification marked as read');
  } catch (error) {
    next(error);
  }
};

const markAllNotificationsRead = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    await Notification.updateMany(
      { recipientUserId: userId, status: 'UNREAD' },
      { status: 'READ', readAt: new Date() }
    );
    return successResponse(res, null, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;
    const notification = await Notification.findOneAndDelete({ _id: id, recipientUserId: userId });
    if (!notification) {
      return errorResponse(res, 'Notification not found', 404, 'NOT_FOUND');
    }
    return successResponse(res, null, 'Notification deleted successfully');
  } catch (error) {
    next(error);
  }
};

const bulkMarkNotificationsRead = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 'ids array is required', 400, 'BAD_REQUEST');
    }
    await Notification.updateMany(
      { _id: { $in: ids }, recipientUserId: userId },
      { status: 'READ', readAt: new Date() }
    );
    return successResponse(res, null, 'Selected notifications marked as read');
  } catch (error) {
    next(error);
  }
};

const bulkDeleteNotifications = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 'ids array is required', 400, 'BAD_REQUEST');
    }
    await Notification.deleteMany({ _id: { $in: ids }, recipientUserId: userId });
    return successResponse(res, null, 'Selected notifications deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  bulkMarkNotificationsRead,
  bulkDeleteNotifications
};
