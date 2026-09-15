const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const NotificationTemplate = require('../models/NotificationTemplate');
const Message = require('../models/Message');
const { successResponse, errorResponse } = require('../utils/response');

const getCommunicationAnalytics = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;

    const [
      totalAnnouncements,
      publishedAnnouncements,
      scheduledAnnouncements,
      totalNotifications,
      unreadNotifications,
      readNotifications,
      categoryStats
    ] = await Promise.all([
      Announcement.countDocuments({ schoolId }),
      Announcement.countDocuments({ schoolId, status: 'PUBLISHED' }),
      Announcement.countDocuments({ schoolId, status: 'SCHEDULED' }),
      Notification.countDocuments({ schoolId }),
      Notification.countDocuments({ schoolId, status: 'UNREAD' }),
      Notification.countDocuments({ schoolId, status: 'READ' }),
      Notification.aggregate([
        { $match: { schoolId } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ])
    ]);

    return successResponse(res, {
      announcements: {
        total: totalAnnouncements,
        published: publishedAnnouncements,
        scheduled: scheduledAnnouncements
      },
      notifications: {
        total: totalNotifications,
        unread: unreadNotifications,
        read: readNotifications,
        readRate: totalNotifications > 0 ? Math.round((readNotifications / totalNotifications) * 100) : 100
      },
      categoryStats
    }, 'Communication analytics loaded successfully');
  } catch (error) {
    next(error);
  }
};

const getNotificationTemplates = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const templates = await NotificationTemplate.find({ schoolId }).sort({ createdAt: -1 });
    return successResponse(res, templates, 'Notification templates loaded');
  } catch (error) {
    next(error);
  }
};

const createNotificationTemplate = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { name, code, category, subject, body, variables } = req.body;

    if (!name || !code || !body) {
      return errorResponse(res, 'Name, Code, and Body are required', 400, 'VALIDATION_ERROR');
    }

    const template = await NotificationTemplate.create({
      schoolId,
      name,
      code: code.toUpperCase(),
      category: category || 'GENERAL',
      subject: subject || '',
      body,
      variables: variables || [],
      createdBy: userId,
      updatedBy: userId
    });

    return successResponse(res, template, 'Notification template created', 201);
  } catch (error) {
    next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { recipientUserId, content } = req.body;

    if (!recipientUserId || !content) {
      return errorResponse(res, 'Recipient and content are required', 400, 'VALIDATION_ERROR');
    }

    const conversationId = [String(userId), String(recipientUserId)].sort().join('_');

    const msg = await Message.create({
      schoolId,
      conversationId,
      senderUserId: userId,
      recipientUserId,
      content,
      status: 'SENT'
    });

    return successResponse(res, msg, 'Message sent successfully', 201);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCommunicationAnalytics,
  getNotificationTemplates,
  createNotificationTemplate,
  sendMessage
};
