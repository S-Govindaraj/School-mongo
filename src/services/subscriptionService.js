/**
 * Phase 9 — Subscription Service
 * Handles plan entitlement checks, subscription creation, and lifecycle events.
 */
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const UsageRecord = require('../models/UsageRecord');
const { AppError } = require('../utils/errors');

class SubscriptionService {
  /**
   * Get the active subscription for a school.
   * Returns null if none found.
   */
  static async getActiveSubscription(schoolId) {
    return Subscription.findOne({
      schoolId,
      status: { $in: ['TRIAL', 'ACTIVE', 'GRACE_PERIOD'] },
    }).populate('planId').lean();
  }

  /**
   * Check if a school has a specific feature enabled.
   */
  static async hasFeature(schoolId, featureKey) {
    const sub = await this.getActiveSubscription(schoolId);
    if (!sub) return false;
    const plan = sub.planId;
    if (!plan) return false;
    const feature = (plan.features || []).find((f) => f.key === featureKey);
    return feature ? feature.enabled : false;
  }

  /**
   * Check usage against a limit.
   * Returns { allowed: Boolean, current: Number, limit: Number }
   */
  static async checkLimit(schoolId, limitKey) {
    const sub = await this.getActiveSubscription(schoolId);
    if (!sub) return { allowed: false, current: 0, limit: 0 };
    const plan = sub.planId;
    const customLimits = sub.customLimits || {};
    const limit = customLimits[limitKey] !== undefined
      ? customLimits[limitKey]
      : (plan?.limits?.[limitKey] !== undefined ? plan.limits[limitKey] : -1);

    if (limit === -1) return { allowed: true, current: 0, limit: -1 }; // unlimited

    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const record = await UsageRecord.findOne({ schoolId, metric: limitKey, period }).lean();
    const current = record ? record.value : 0;

    return { allowed: current < limit, current, limit };
  }

  /**
   * Increment a usage metric.
   */
  static async incrementUsage(schoolId, metric, amount = 1, subscriptionId = null) {
    const period = new Date().toISOString().slice(0, 7);
    const date = new Date().toISOString().slice(0, 10);
    await UsageRecord.findOneAndUpdate(
      { schoolId, metric, period },
      {
        $inc: { value: amount },
        $set: { date, subscriptionId, recordedAt: new Date() },
        $setOnInsert: { schoolId, metric, period },
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Create trial subscription when school is onboarded.
   */
  static async createTrialSubscription(schoolId, planCode = 'STARTER', createdBy = null) {
    const plan = await Plan.findOne({ code: planCode.toUpperCase(), status: 'ACTIVE' }).lean();
    if (!plan) throw new AppError(`Plan ${planCode} not found`, 404);

    const existing = await Subscription.findOne({ schoolId, status: { $ne: 'EXPIRED' } });
    if (existing) throw new AppError('Subscription already exists for this school', 409);

    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + (plan.trialDays || 14));

    const sub = await Subscription.create({
      schoolId,
      planId: plan._id,
      planCode: plan.code,
      planSnapshot: plan,
      status: 'TRIAL',
      billingCycle: 'TRIAL',
      trialStartDate: trialStart,
      trialEndDate: trialEnd,
      currentPeriodStart: trialStart,
      currentPeriodEnd: trialEnd,
      createdBy,
    });

    await SubscriptionEvent.create({
      schoolId,
      subscriptionId: sub._id,
      eventType: 'TRIAL_STARTED',
      newStatus: 'TRIAL',
      metadata: { planCode, trialDays: plan.trialDays },
      performedBy: createdBy,
    });

    return sub;
  }

  /**
   * Activate a subscription (move from TRIAL or after payment).
   */
  static async activateSubscription(subscriptionId, billingCycle = 'MONTHLY', performedBy = null) {
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) throw new AppError('Subscription not found', 404);

    const oldStatus = sub.status;
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'ANNUAL') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    sub.status = 'ACTIVE';
    sub.billingCycle = billingCycle;
    sub.currentPeriodStart = now;
    sub.currentPeriodEnd = periodEnd;
    await sub.save();

    await SubscriptionEvent.create({
      schoolId: sub.schoolId,
      subscriptionId: sub._id,
      eventType: 'ACTIVATED',
      oldStatus,
      newStatus: 'ACTIVE',
      performedBy,
    });

    return sub;
  }

  /**
   * Cancel a subscription.
   */
  static async cancelSubscription(subscriptionId, reason = '', performedBy = null) {
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) throw new AppError('Subscription not found', 404);

    const oldStatus = sub.status;
    sub.status = 'CANCELLED';
    sub.cancelledAt = new Date();
    sub.cancelReason = reason;
    await sub.save();

    await SubscriptionEvent.create({
      schoolId: sub.schoolId,
      subscriptionId: sub._id,
      eventType: 'CANCELLED',
      oldStatus,
      newStatus: 'CANCELLED',
      metadata: { reason },
      performedBy,
    });

    return sub;
  }

  /**
   * Change plan (upgrade/downgrade).
   */
  static async changePlan(subscriptionId, newPlanCode, performedBy = null) {
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) throw new AppError('Subscription not found', 404);

    const plan = await Plan.findOne({ code: newPlanCode.toUpperCase(), status: 'ACTIVE' }).lean();
    if (!plan) throw new AppError(`Plan ${newPlanCode} not found`, 404);

    const oldPlanCode = sub.planCode;
    sub.planId = plan._id;
    sub.planCode = plan.code;
    sub.planSnapshot = plan;
    await sub.save();

    const isUpgrade = plan.pricing.monthly > (sub.planSnapshot?.pricing?.monthly || 0);
    await SubscriptionEvent.create({
      schoolId: sub.schoolId,
      subscriptionId: sub._id,
      eventType: isUpgrade ? 'UPGRADED' : 'DOWNGRADED',
      metadata: { oldPlanCode, newPlanCode: plan.code },
      performedBy,
    });

    return sub;
  }

  /**
   * Get usage summary for a school.
   */
  static async getUsageSummary(schoolId) {
    const period = new Date().toISOString().slice(0, 7);
    const records = await UsageRecord.find({ schoolId, period }).lean();
    const sub = await this.getActiveSubscription(schoolId);
    const plan = sub?.planId;
    const customLimits = sub?.customLimits || {};

    const usage = {};
    for (const rec of records) {
      const limit = customLimits[rec.metric] !== undefined
        ? customLimits[rec.metric]
        : (plan?.limits?.[rec.metric] !== undefined ? plan.limits[rec.metric] : -1);
      usage[rec.metric] = {
        current: rec.value,
        limit,
        percentage: limit === -1 ? null : Math.round((rec.value / limit) * 100),
      };
    }

    return usage;
  }
}

module.exports = SubscriptionService;
