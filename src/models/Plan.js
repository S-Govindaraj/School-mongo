const mongoose = require('mongoose');

const planFeatureSchema = new mongoose.Schema({
  key: { type: String, required: true }, // e.g. 'exams_enabled', 'payroll_enabled'
  enabled: { type: Boolean, default: true },
  limit: { type: Number }, // null = unlimited
}, { _id: false });

const planSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    description: String,
    tier: {
      type: String,
      enum: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'],
      default: 'STARTER',
    },
    pricing: {
      monthly: { type: Number, default: 0 },
      annual: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
    },
    trialDays: { type: Number, default: 14 },
    features: [planFeatureSchema],
    limits: {
      students: { type: Number, default: 500 },         // -1 = unlimited
      staff: { type: Number, default: 50 },
      storage_gb: { type: Number, default: 5 },
      api_requests_per_day: { type: Number, default: 1000 },
      campuses: { type: Number, default: 1 },
      users: { type: Number, default: 25 },
    },
    isPublic: { type: Boolean, default: true },
    isCustom: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

planSchema.index({ status: 1 });

module.exports = mongoose.model('Plan', planSchema);
