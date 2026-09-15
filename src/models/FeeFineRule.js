const mongoose = require('mongoose');

const feeFineRuleSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    calculationType: {
      type: String,
      enum: ['FIXED', 'PERCENTAGE', 'DAILY', 'MONTHLY'],
      default: 'FIXED',
    },
    value: { type: Number, required: true, min: 0 },
    graceDays: { type: Number, default: 0 },
    maximumAmount: { type: Number, default: 0 },
    applicableFeeCategoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory' }],
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

feeFineRuleSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('FeeFineRule', feeFineRuleSchema);
