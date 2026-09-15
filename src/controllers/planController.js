/**
 * Phase 9 — Plan Controller
 * Public: list plans. Platform admin: CRUD plans.
 */
const Plan = require('../models/Plan');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

// GET /api/v1/platform/plans  (public listing)
exports.listPlans = async (req, res, next) => {
  try {
    const filter = { status: 'ACTIVE' };
    if (req.query.tier) filter.tier = req.query.tier;
    const plans = await Plan.find(filter).sort({ sortOrder: 1 }).lean();
    return successResponse(res, plans, 'Plans retrieved');
  } catch (err) { next(err); }
};

// GET /api/v1/platform/plans/:id
exports.getPlan = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id).lean();
    if (!plan) throw new NotFoundError('Plan not found');
    return successResponse(res, plan, 'Plan retrieved');
  } catch (err) { next(err); }
};

// POST /api/v1/platform/plans
exports.createPlan = async (req, res, next) => {
  try {
    const { code, name, description, tier, pricing, trialDays, features, limits, isPublic, sortOrder } = req.body;
    if (!code || !name) throw new ValidationError('code and name are required');
    const plan = await Plan.create({ code, name, description, tier, pricing, trialDays, features, limits, isPublic, sortOrder });
    await logAudit(req, 'plan_create', 'Plan', plan._id, null, plan.toObject());
    return successResponse(res, plan, 'Plan created', 201);
  } catch (err) { next(err); }
};

// PUT /api/v1/platform/plans/:id
exports.updatePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) throw new NotFoundError('Plan not found');
    const before = plan.toObject();
    const allowed = ['name', 'description', 'tier', 'pricing', 'trialDays', 'features', 'limits', 'isPublic', 'sortOrder', 'status'];
    allowed.forEach((k) => { if (req.body[k] !== undefined) plan[k] = req.body[k]; });
    await plan.save();
    await logAudit(req, 'plan_update', 'Plan', plan._id, before, plan.toObject());
    return successResponse(res, plan, 'Plan updated');
  } catch (err) { next(err); }
};

// DELETE /api/v1/platform/plans/:id
exports.deletePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) throw new NotFoundError('Plan not found');
    plan.status = 'ARCHIVED';
    await plan.save();
    await logAudit(req, 'plan_archive', 'Plan', plan._id, null, null);
    return successResponse(res, null, 'Plan archived');
  } catch (err) { next(err); }
};
