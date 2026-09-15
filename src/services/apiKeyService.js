/**
 * Phase 9 — API Key Service
 * Handles API key generation, hashing, and validation.
 */
const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const { AppError } = require('../utils/errors');

class ApiKeyService {
  static generateKey() {
    const raw = `sk_${crypto.randomBytes(32).toString('hex')}`;
    const prefix = raw.slice(0, 10); // 'sk_' + 7 chars
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, prefix, hash };
  }

  static hashKey(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Create a new API key. Returns the full raw key only once.
   */
  static async create(schoolId, { name, description, scopes, ipWhitelist, expiresAt, rateLimitPerMinute }, createdBy) {
    const { raw, prefix, hash } = this.generateKey();

    const key = await ApiKey.create({
      schoolId,
      name,
      description,
      prefix,
      keyHash: hash,
      scopes: scopes || [],
      ipWhitelist: ipWhitelist || [],
      expiresAt,
      rateLimitPerMinute: rateLimitPerMinute || 60,
      createdBy,
    });

    return { ...key.toSafeJSON(), rawKey: raw }; // rawKey shown only once
  }

  /**
   * Authenticate an API key. Returns the key document or null.
   */
  static async authenticate(rawKey) {
    const hash = this.hashKey(rawKey);
    const key = await ApiKey.findOne({ keyHash: hash, status: 'ACTIVE' });
    if (!key) return null;

    // Check expiry
    if (key.expiresAt && key.expiresAt < new Date()) {
      await ApiKey.findByIdAndUpdate(key._id, { status: 'EXPIRED' });
      return null;
    }

    // Update usage stats
    await ApiKey.findByIdAndUpdate(key._id, {
      $inc: { usageCount: 1 },
      $set: { lastUsedAt: new Date() },
    });

    return key;
  }

  /**
   * Revoke a key.
   */
  static async revoke(schoolId, keyId, revokedBy, reason = '') {
    const key = await ApiKey.findOne({ _id: keyId, schoolId });
    if (!key) throw new AppError('API key not found', 404);

    key.status = 'REVOKED';
    key.revokedAt = new Date();
    key.revokedBy = revokedBy;
    key.revokeReason = reason;
    await key.save();

    return key.toSafeJSON();
  }

  /**
   * List all keys for a school (safe, no hashes).
   */
  static async list(schoolId) {
    const keys = await ApiKey.find({ schoolId }).sort({ createdAt: -1 }).lean();
    return keys.map((k) => {
      const { keyHash, ...safe } = k;
      return safe;
    });
  }
}

module.exports = ApiKeyService;
