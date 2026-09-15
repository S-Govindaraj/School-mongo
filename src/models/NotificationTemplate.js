const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  category: {
    type: String,
    required: true
  },
  channel: {
    type: String,
    enum: ['IN_APP', 'EMAIL', 'SMS', 'PUSH'],
    default: 'IN_APP'
  },
  subject: {
    type: String,
    default: ''
  },
  body: {
    type: String,
    required: true
  },
  variables: [{
    type: String
  }],
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

notificationTemplateSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
