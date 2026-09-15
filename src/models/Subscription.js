const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    planCode: { type: String, required: true },
    planSnapshot: mongoose.Schema.Types.Mixed, // Immutable snapshot of plan at subscription time
    status: {
      type: String,
      enum: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED', 'EXPIRED'],
      default: 'TRIAL',
      index: true,
    },
    billingCycle: {
      type: String,
      enum: ['MONTHLY', 'ANNUAL', 'TRIAL', 'CUSTOM'],
      default: 'TRIAL',
    },
    trialStartDate: Date,
    trialEndDate: Date,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelledAt: Date,
    cancelReason: String,
    suspendedAt: Date,
    suspendReason: String,
    gracePeriodEndsAt: Date,
    customLimits: {
      students: Number,
      staff: Number,
      storage_gb: Number,
      api_requests_per_day: Number,
      campuses: Number,
      users: Number,
    },
    addOns: [
      {
        code: String,
        name: String,
        value: mongoose.Schema.Types.Mixed,
      }
    ],
    couponCode: String,
    discountPercent: { type: Number, default: 0 },
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

subscriptionSchema.index({ schoolId: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1, status: 1 }); // For renewal processing

module.exports = mongoose.model('Subscription', subscriptionSchema);
