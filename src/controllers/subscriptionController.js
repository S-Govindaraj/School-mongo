/**
 * Phase 9 — Subscription Controller
 * School-level subscription management.
 */
const SubscriptionService = require('../services/subscriptionService');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const { successResponse } = require('../utils/response');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

// GET /api/v1/subscription  (get my school's subscription)
exports.getMySubscription = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const sub = await SubscriptionService.getActiveSubscription(schoolId);
    const usage = await SubscriptionService.getUsageSummary(schoolId);
    return successResponse(res, { subscription: sub, usage }, 'Subscription retrieved');
  } catch (err) { next(err); }
};

// GET /api/v1/subscription/history
exports.getSubscriptionHistory = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const events = await SubscriptionEvent.find({ schoolId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return successResponse(res, events, 'Subscription events retrieved');
  } catch (err) { next(err); }
};

// POST /api/v1/subscription/activate  (platform admin or billing webhook)
exports.activate = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const sub = await Subscription.findOne({ schoolId, status: { $ne: 'EXPIRED' } });
    if (!sub) throw new NotFoundError('No subscription found');
    const updated = await SubscriptionService.activateSubscription(sub._id, req.body.billingCycle, req.user._id);
    await logAudit(req, 'subscription_activate', 'Subscription', sub._id, null, updated.toObject());
    return successResponse(res, updated, 'Subscription activated');
  } catch (err) { next(err); }
};

// POST /api/v1/subscription/cancel
exports.cancel = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const sub = await Subscription.findOne({ schoolId, status: { $in: ['TRIAL', 'ACTIVE', 'GRACE_PERIOD'] } });
    if (!sub) throw new NotFoundError('No active subscription found');
    const updated = await SubscriptionService.cancelSubscription(sub._id, req.body.reason, req.user._id);
    await logAudit(req, 'subscription_cancel', 'Subscription', sub._id, null, updated.toObject());
    return successResponse(res, updated, 'Subscription cancelled');
  } catch (err) { next(err); }
};

// POST /api/v1/subscription/change-plan
exports.changePlan = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const sub = await Subscription.findOne({ schoolId, status: { $in: ['TRIAL', 'ACTIVE'] } });
    if (!sub) throw new NotFoundError('No active subscription found');
    if (!req.body.planCode) throw new NotFoundError('planCode is required');
    const updated = await SubscriptionService.changePlan(sub._id, req.body.planCode, req.user._id);
    await logAudit(req, 'subscription_plan_change', 'Subscription', sub._id, null, updated.toObject());
    return successResponse(res, updated, 'Plan changed successfully');
  } catch (err) { next(err); }
};

// GET /api/v1/subscription/usage
exports.getUsage = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const usage = await SubscriptionService.getUsageSummary(schoolId);
    return successResponse(res, usage, 'Usage retrieved');
  } catch (err) { next(err); }
};

// ========================================================
// Platform Admin Endpoints — /api/v1/platform/subscriptions
// ========================================================

// GET /api/v1/platform/subscriptions
exports.listAll = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.planCode) filter.planCode = req.query.planCode;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const [total, subs] = await Promise.all([
      Subscription.countDocuments(filter),
      Subscription.find(filter)
        .populate('schoolId', 'name code')
        .populate('planId', 'name code tier')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);
    return successResponse(res, subs, 'Subscriptions retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};

// POST /api/v1/platform/subscriptions/:schoolId/create-trial
exports.createTrialForSchool = async (req, res, next) => {
  try {
    const { schoolId } = req.params;
    const sub = await SubscriptionService.createTrialSubscription(schoolId, req.body.planCode || 'STARTER', req.user._id);
    await logAudit(req, 'subscription_trial_create', 'Subscription', sub._id, null, sub.toObject());
    return successResponse(res, sub, 'Trial subscription created', 201);
  } catch (err) { next(err); }
};

// PUT /api/v1/platform/subscriptions/:id
exports.adminUpdateSubscription = async (req, res, next) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) throw new NotFoundError('Subscription not found');
    const before = sub.toObject();
    const allowed = ['status', 'customLimits', 'addOns', 'notes', 'gracePeriodEndsAt', 'currentPeriodEnd'];
    allowed.forEach((k) => { if (req.body[k] !== undefined) sub[k] = req.body[k]; });
    sub.updatedBy = req.user._id;
    await sub.save();
    await logAudit(req, 'subscription_admin_update', 'Subscription', sub._id, before, sub.toObject());
    return successResponse(res, sub, 'Subscription updated');
  } catch (err) { next(err); }
};
