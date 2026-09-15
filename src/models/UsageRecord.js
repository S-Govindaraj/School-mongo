const mongoose = require('mongoose');

const usageRecordSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', index: true },
    metric: {
      type: String,
      required: true,
      // students, staff, users, storage_gb, api_requests, emails, sms, push_notifications, exports, imports
    },
    value: { type: Number, required: true, default: 0 },
    period: {
      type: String, // YYYY-MM  for monthly aggregation
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD for daily
      index: true,
    },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

usageRecordSchema.index({ schoolId: 1, metric: 1, period: 1 }, { unique: true });
usageRecordSchema.index({ schoolId: 1, date: 1 });

module.exports = mongoose.model('UsageRecord', usageRecordSchema);
