/**
 * Phase 9 — Webhook Controller
 */
const Webhook = require('../models/Webhook');
const WebhookDelivery = require('../models/WebhookDelivery');
const WebhookService = require('../services/webhookService');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');
const crypto = require('crypto');

// GET /api/v1/webhooks
exports.list = async (req, res, next) => {
  try {
    const hooks = await Webhook.find({ schoolId: req.schoolContext.schoolId }).sort({ createdAt: -1 }).lean();
    // Strip secret from list view
    return successResponse(res, hooks.map(({ secret, ...h }) => h), 'Webhooks retrieved');
  } catch (err) { next(err); }
};

// POST /api/v1/webhooks
exports.create = async (req, res, next) => {
  try {
    const { name, url, events, headers, retryCount, timeoutMs } = req.body;
    if (!name || !url || !events?.length) throw new ValidationError('name, url, and events are required');
    const rawSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const hook = await Webhook.create({
      schoolId: req.schoolContext.schoolId,
      name, url, events, headers, retryCount, timeoutMs,
      secret: rawSecret,
      createdBy: req.user._id,
    });
    await logAudit(req, 'webhook_create', 'Webhook', hook._id, null, { name, url, events });
    // Return secret only once
    return successResponse(res, { ...hook.toObject(), secret: rawSecret }, 'Webhook created — save the secret now', 201);
  } catch (err) { next(err); }
};

// PUT /api/v1/webhooks/:id
exports.update = async (req, res, next) => {
  try {
    const hook = await Webhook.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!hook) throw new NotFoundError('Webhook not found');
    const before = { name: hook.name, url: hook.url, events: hook.events, isActive: hook.isActive };
    const allowed = ['name', 'url', 'events', 'headers', 'retryCount', 'timeoutMs', 'isActive'];
    allowed.forEach((k) => { if (req.body[k] !== undefined) hook[k] = req.body[k]; });
    await hook.save();
    await logAudit(req, 'webhook_update', 'Webhook', hook._id, before, null);
    const { secret, ...safe } = hook.toObject();
    return successResponse(res, safe, 'Webhook updated');
  } catch (err) { next(err); }
};

// DELETE /api/v1/webhooks/:id
exports.remove = async (req, res, next) => {
  try {
    const hook = await Webhook.findOneAndDelete({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!hook) throw new NotFoundError('Webhook not found');
    await logAudit(req, 'webhook_delete', 'Webhook', req.params.id, null, null);
    return successResponse(res, null, 'Webhook deleted');
  } catch (err) { next(err); }
};

// POST /api/v1/webhooks/:id/test
exports.test = async (req, res, next) => {
  try {
    const hook = await Webhook.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!hook) throw new NotFoundError('Webhook not found');
    await WebhookService.dispatch(req.schoolContext.schoolId, 'webhook.test', { message: 'This is a test event from School ERP' });
    return successResponse(res, null, 'Test event dispatched');
  } catch (err) { next(err); }
};

// GET /api/v1/webhooks/:id/deliveries
exports.deliveries = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [total, deliveries] = await Promise.all([
      WebhookDelivery.countDocuments({ schoolId: req.schoolContext.schoolId, webhookId: req.params.id }),
      WebhookDelivery.find({ schoolId: req.schoolContext.schoolId, webhookId: req.params.id })
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return successResponse(res, deliveries, 'Deliveries retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};
