const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const User = require('../models/User');
const StudentGuardian = require('../models/StudentGuardian');
const Enrollment = require('../models/Enrollment');
const { successResponse, errorResponse } = require('../utils/response');

const getAnnouncements = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { status, audienceType, search, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId };
    if (status && status !== 'ALL') query.status = status;
    if (audienceType && audienceType !== 'ALL') query.audienceType = audienceType;
    if (search && search.trim()) {
      query.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { content: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const [announcements, total] = await Promise.all([
      Announcement.find(query)
        .populate('targetGradeIds', 'name code')
        .populate('targetSectionIds', 'name code')
        .populate('createdBy', 'name email')
        .populate('publishedBy', 'name email')
        .sort({ publishAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Announcement.countDocuments(query)
    ]);

    return successResponse(res, announcements, 'Announcements fetched successfully', 200, {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
};

const createAnnouncement = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;

    const {
      title,
      content,
      summary = '',
      announcementType = 'GENERAL',
      priority = 'NORMAL',
      audienceType = 'SCHOOL',
      targetGradeIds = [],
      targetSectionIds = [],
      targetStudentIds = [],
      targetStaffIds = [],
      publishAt,
      expiresAt,
      status = 'DRAFT'
    } = req.body;

    if (!title || !content) {
      return errorResponse(res, 'Title and Content are required', 400, 'VALIDATION_ERROR');
    }

    const announcement = await Announcement.create({
      schoolId,
      title,
      content,
      summary,
      announcementType,
      priority,
      audienceType,
      targetGradeIds,
      targetSectionIds,
      targetStudentIds,
      targetStaffIds,
      publishAt: publishAt ? new Date(publishAt) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      status,
      createdBy: userId,
      publishedBy: status === 'PUBLISHED' ? userId : undefined,
      publishedAt: status === 'PUBLISHED' ? new Date() : undefined
    });

    // If directly created as PUBLISHED, trigger notifications
    if (status === 'PUBLISHED') {
      await createNotificationsForAnnouncement(schoolId, announcement);
    }

    return successResponse(res, announcement, 'Announcement created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const publishAnnouncement = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const userId = req.user?._id;
    const { id } = req.params;

    const announcement = await Announcement.findOne({ _id: id, schoolId });
    if (!announcement) {
      return errorResponse(res, 'Announcement not found', 404, 'NOT_FOUND');
    }

    announcement.status = 'PUBLISHED';
    announcement.publishedBy = userId;
    announcement.publishedAt = new Date();
    await announcement.save();

    // Trigger notification engine
    await createNotificationsForAnnouncement(schoolId, announcement);

    return successResponse(res, announcement, 'Announcement published successfully');
  } catch (error) {
    next(error);
  }
};

// Internal notification creation for targeted audience
const createNotificationsForAnnouncement = async (schoolId, announcement) => {
  try {
    const users = await User.find({ schoolId, status: 'ACTIVE' }).select('_id role');
    const notificationsToInsert = [];

    for (const u of users) {
      notificationsToInsert.push({
        schoolId,
        recipientUserId: u._id,
        recipientType: u.role || 'ADMIN',
        category: 'ANNOUNCEMENT',
        title: announcement.title,
        message: announcement.summary || announcement.content.substring(0, 100),
        entityType: 'ANNOUNCEMENT',
        entityId: announcement._id,
        priority: announcement.priority,
        channel: 'IN_APP',
        status: 'UNREAD',
        deliveredAt: new Date()
      });
    }

    if (notificationsToInsert.length > 0) {
      await Notification.insertMany(notificationsToInsert);
    }
  } catch (err) {
    console.error('Failed to dispatch notifications for announcement:', err);
  }
};

module.exports = {
  getAnnouncements,
  createAnnouncement,
  publishAnnouncement
};
