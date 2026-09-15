const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  preferences: [{
    category: {
      type: String,
      enum: ['ATTENDANCE', 'EXAM', 'RESULT', 'FEE', 'PAYMENT', 'ANNOUNCEMENT', 'LEAVE', 'TIMETABLE', 'SYSTEM'],
      required: true
    },
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: true }
  }]
}, { timestamps: true });

notificationPreferenceSchema.index({ schoolId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
