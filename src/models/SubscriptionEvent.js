const mongoose = require('mongoose');

const subscriptionEventSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
    eventType: {
      type: String,
      required: true,
      enum: [
        'TRIAL_STARTED', 'TRIAL_EXTENDED', 'TRIAL_EXPIRED',
        'ACTIVATED', 'UPGRADED', 'DOWNGRADED', 'RENEWED',
        'PAYMENT_SUCCESS', 'PAYMENT_FAILED',
        'PAST_DUE', 'GRACE_PERIOD_STARTED', 'GRACE_PERIOD_ENDED',
        'SUSPENDED', 'UNSUSPENDED',
        'CANCELLED', 'REACTIVATED', 'EXPIRED',
        'PLAN_CHANGED', 'LIMIT_CHANGED', 'ADDON_ADDED', 'ADDON_REMOVED',
      ],
    },
    oldStatus: String,
    newStatus: String,
    metadata: mongoose.Schema.Types.Mixed,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
  },
  { timestamps: true }
);

subscriptionEventSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = mongoose.model('SubscriptionEvent', subscriptionEventSchema);
