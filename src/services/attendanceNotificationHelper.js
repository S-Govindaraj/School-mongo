// Plain inline notification helper for absence alerts — mirrors the exact
// pattern used by services/examNotificationHelper.js (raw model queries +
// Notification.insertMany, no shared notification service). Never throws:
// a notification failure must never fail the attendance write that
// triggers it. Closes ATTENDANCE_REDESIGN.md finding #20 ("no absence
// notification anywhere despite the ATTENDANCE notification category and
// a webhook event already being scaffolded").
const Student = require('../models/Student');
const StudentGuardian = require('../models/StudentGuardian');
const User = require('../models/User');
const Notification = require('../models/Notification');
const logger = require('../config/logger');

/**
 * @param {string} schoolId
 * @param {Array<{studentId, statusName, date}>} absences - one entry per
 *   student whose FINAL status for this write is countsAsAbsent === true.
 */
const createAbsenceNotifications = async (schoolId, absences) => {
  try {
    if (!absences || absences.length === 0) return;

    const studentIds = absences.map((a) => a.studentId);

    const [students, links] = await Promise.all([
      Student.find({ schoolId, _id: { $in: studentIds } }).select('email firstName lastName').lean(),
      StudentGuardian.find({ schoolId, studentId: { $in: studentIds } })
        .populate('guardianId', 'email')
        .lean(),
    ]);

    const studentById = new Map(students.map((s) => [String(s._id), s]));

    const emailSet = new Set();
    students.forEach((s) => { if (s.email) emailSet.add(String(s.email).toLowerCase()); });
    links.forEach((l) => { if (l.guardianId?.email) emailSet.add(String(l.guardianId.email).toLowerCase()); });

    const emails = Array.from(emailSet);
    const users = emails.length
      ? await User.find({ schoolId, status: 'ACTIVE', email: { $in: emails } }).select('_id email').lean()
      : [];

    const userByEmail = new Map(users.map((u) => [String(u.email).toLowerCase(), u]));

    const notificationsToInsert = [];

    for (const absence of absences) {
      const student = studentById.get(String(absence.studentId));
      const studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Student';
      const dateStr = absence.date instanceof Date ? absence.date.toISOString().split('T')[0] : String(absence.date);
      const title = 'Absence Recorded';
      const message = `${studentName} was marked ${absence.statusName || 'absent'} on ${dateStr}.`;

      const studentUser = student?.email && userByEmail.get(String(student.email).toLowerCase());
      if (studentUser) {
        notificationsToInsert.push({
          schoolId,
          recipientUserId: studentUser._id,
          recipientType: 'STUDENT',
          category: 'ATTENDANCE',
          title,
          message,
          entityType: 'AttendanceDay',
          entityId: absence.recordId,
          priority: 'NORMAL',
          channel: 'IN_APP',
          status: 'UNREAD',
        });
      }

      const guardianLinks = links.filter((l) => String(l.studentId) === String(absence.studentId));
      for (const l of guardianLinks) {
        const email = l.guardianId?.email;
        const guardianUser = email && userByEmail.get(String(email).toLowerCase());
        if (!guardianUser) continue;
        notificationsToInsert.push({
          schoolId,
          recipientUserId: guardianUser._id,
          recipientType: 'PARENT',
          category: 'ATTENDANCE',
          title,
          message,
          entityType: 'AttendanceDay',
          entityId: absence.recordId,
          priority: 'HIGH',
          channel: 'IN_APP',
          status: 'UNREAD',
        });
      }
    }

    if (notificationsToInsert.length > 0) {
      await Notification.insertMany(notificationsToInsert);
    }
  } catch (err) {
    logger.error(`Failed to dispatch attendance absence notifications: ${err.message}`);
  }
};

module.exports = { createAbsenceNotifications };
