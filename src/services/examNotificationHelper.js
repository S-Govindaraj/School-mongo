// Plain inline notification helper for the Examinations module — mirrors the
// exact pattern used by controllers/announcementController.js's
// createNotificationsForAnnouncement (raw model queries + Notification.insertMany,
// no shared notification service). Never throws: a notification failure must
// never fail the exam-publish response that triggers it.
const Student = require('../models/Student');
const StudentGuardian = require('../models/StudentGuardian');
const User = require('../models/User');
const Notification = require('../models/Notification');
const logger = require('../config/logger');

// Resolves each student's own portal User (matched by Student.email, the same
// email-based linkage portalStudentController.js/portalParentController.js
// already rely on) and their linked guardians' portal Users (via
// StudentGuardian -> Guardian.email), then inserts one RESULT notification
// per resolved recipient.
const createResultPublishedNotifications = async (schoolId, exam, publishedStudentIds) => {
  try {
    if (!exam || !publishedStudentIds || publishedStudentIds.length === 0) return;

    const [students, links] = await Promise.all([
      Student.find({ schoolId, _id: { $in: publishedStudentIds } }).select('email').lean(),
      StudentGuardian.find({ schoolId, studentId: { $in: publishedStudentIds } })
        .populate('guardianId', 'email')
        .lean(),
    ]);

    const emailSet = new Set();
    students.forEach((s) => { if (s.email) emailSet.add(String(s.email).toLowerCase()); });
    links.forEach((l) => { if (l.guardianId?.email) emailSet.add(String(l.guardianId.email).toLowerCase()); });

    const emails = Array.from(emailSet);
    const users = emails.length
      ? await User.find({ schoolId, status: 'ACTIVE', email: { $in: emails } }).select('_id email').lean()
      : [];

    const userByEmail = {};
    users.forEach((u) => { userByEmail[String(u.email).toLowerCase()] = u; });

    const title = 'Results Published';
    const message = `Results for ${exam.title} have been published.`;
    const notificationsToInsert = [];

    students.forEach((s) => {
      const u = s.email && userByEmail[String(s.email).toLowerCase()];
      if (!u) return;
      notificationsToInsert.push({
        schoolId,
        recipientUserId: u._id,
        recipientType: 'STUDENT',
        category: 'RESULT',
        title,
        message,
        entityType: 'Exam',
        entityId: String(exam._id),
        priority: 'NORMAL',
        channel: 'IN_APP',
        status: 'UNREAD',
      });
    });

    links.forEach((l) => {
      const email = l.guardianId?.email;
      const u = email && userByEmail[String(email).toLowerCase()];
      if (!u) return;
      notificationsToInsert.push({
        schoolId,
        recipientUserId: u._id,
        recipientType: 'PARENT',
        category: 'RESULT',
        title,
        message,
        entityType: 'Exam',
        entityId: String(exam._id),
        priority: 'NORMAL',
        channel: 'IN_APP',
        status: 'UNREAD',
      });
    });

    if (notificationsToInsert.length > 0) {
      await Notification.insertMany(notificationsToInsert);
    }
  } catch (err) {
    logger.error(`Failed to dispatch exam result-published notifications: ${err.message}`);
  }
};

module.exports = {
  createResultPublishedNotifications,
};
