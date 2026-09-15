const mongoose = require('mongoose');

const mobileDeviceSchema = new mongoose.Schema(
  {
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
    deviceId: {
      type: String,
      required: true,
      trim: true
    },
    platform: {
      type: String,
      enum: ['ANDROID', 'IOS', 'WEB_PWA', 'DESKTOP'],
      default: 'WEB_PWA'
    },
    pushToken: {
      type: String,
      default: null,
      trim: true
    },
    appVersion: {
      type: String,
      default: '1.0.0'
    },
    deviceName: {
      type: String,
      default: 'Mobile Device'
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: true
  }
);

mobileDeviceSchema.index({ schoolId: 1, userId: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('MobileDevice', mobileDeviceSchema);
