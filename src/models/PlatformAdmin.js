const mongoose = require('mongoose');

const platformAdminSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'BILLING_ADMIN', 'SUPPORT_AGENT', 'READ_ONLY'],
      default: 'SUPPORT_AGENT',
    },
    permissions: [String], // Fine-grained permissions beyond role
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

platformAdminSchema.index({ email: 1 }, { unique: true });
platformAdminSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('PlatformAdmin', platformAdminSchema);
