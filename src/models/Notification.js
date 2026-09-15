const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  recipientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recipientType: {
    type: String,
    enum: ['ADMIN', 'TEACHER', 'PARENT', 'STUDENT'],
    required: true
  },
  category: {
    type: String,
    enum: ['ATTENDANCE', 'EXAM', 'RESULT', 'FEE', 'PAYMENT', 'ANNOUNCEMENT', 'LEAVE', 'TIMETABLE', 'ADMISSION', 'SYSTEM', 'OTHER'],
    default: 'SYSTEM'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  entityType: {
    type: String,
    default: ''
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId
  },
  actionUrl: {
    type: String,
    default: ''
  },
  priority: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
    default: 'NORMAL'
  },
  channel: {
    type: String,
    enum: ['IN_APP', 'EMAIL', 'SMS', 'PUSH'],
    default: 'IN_APP'
  },
  status: {
    type: String,
    enum: ['UNREAD', 'READ', 'ARCHIVED'],
    default: 'UNREAD'
  },
  readAt: {
    type: Date
  },
  deliveredAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date
  }
}, { timestamps: true });

notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, status: 1 });
notificationSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
