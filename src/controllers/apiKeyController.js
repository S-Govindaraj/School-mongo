/**
 * Phase 9 — API Key Controller
 */
const ApiKeyService = require('../services/apiKeyService');
const { successResponse } = require('../utils/response');
const { ValidationError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

// GET /api/v1/api-keys
exports.list = async (req, res, next) => {
  try {
    const keys = await ApiKeyService.list(req.schoolContext.schoolId);
    return successResponse(res, keys, 'API keys retrieved');
  } catch (err) { next(err); }
};

// POST /api/v1/api-keys
exports.create = async (req, res, next) => {
  try {
    const { name, description, scopes, ipWhitelist, expiresAt, rateLimitPerMinute } = req.body;
    if (!name) throw new ValidationError('name is required');
    const result = await ApiKeyService.create(
      req.schoolContext.schoolId,
      { name, description, scopes, ipWhitelist, expiresAt, rateLimitPerMinute },
      req.user._id
    );
    await logAudit(req, 'apikey_create', 'ApiKey', result._id, null, { name, scopes });
    return successResponse(res, result, 'API key created — save the rawKey now, it will not be shown again', 201);
  } catch (err) { next(err); }
};

// DELETE /api/v1/api-keys/:id/revoke
exports.revoke = async (req, res, next) => {
  try {
    const result = await ApiKeyService.revoke(req.schoolContext.schoolId, req.params.id, req.user._id, req.body.reason);
    await logAudit(req, 'apikey_revoke', 'ApiKey', req.params.id, null, null);
    return successResponse(res, result, 'API key revoked');
  } catch (err) { next(err); }
};
