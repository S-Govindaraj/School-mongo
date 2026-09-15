const mongoose = require('mongoose');

const syncRecordSchema = new mongoose.Schema(
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
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    entityType: {
      type: String,
      required: true,
      index: true
    },
    operation: {
      type: String,
      required: true
    },
    entityId: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'CONFLICT'],
      default: 'SUCCESS'
    },
    clientTimestamp: {
      type: Date,
      default: null
    },
    responsePayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('SyncRecord', syncRecordSchema);
