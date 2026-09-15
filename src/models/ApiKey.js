const mongoose = require('mongoose');
const crypto = require('crypto');

const apiKeySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: String,
    prefix: { type: String, required: true }, // First 8 chars for display
    keyHash: { type: String, required: true },  // SHA-256 hash of the full key
    scopes: [{ type: String }], // e.g. ['students:read', 'attendance:read']
    ipWhitelist: [String], // Empty = no restriction
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'EXPIRED'],
      default: 'ACTIVE',
      index: true,
    },
    expiresAt: Date,
    lastUsedAt: Date,
    usageCount: { type: Number, default: 0 },
    rateLimitPerMinute: { type: Number, default: 60 },
    revokedAt: Date,
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    revokeReason: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

apiKeySchema.index({ schoolId: 1, status: 1 });
apiKeySchema.index({ keyHash: 1 }); // For authentication lookup
apiKeySchema.index({ prefix: 1 });

// Never expose keyHash
apiKeySchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.keyHash;
  return obj;
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
