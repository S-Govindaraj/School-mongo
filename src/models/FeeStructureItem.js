const mongoose = require('mongoose');

const feeStructureItemSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure', required: true, index: true },
    feeCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory', required: true, index: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 }, // Stored in major units or integer minor units
    frequency: { type: String, enum: ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'], default: 'MONTHLY' },
    isMandatory: { type: Boolean, default: true },
    isOptional: { type: Boolean, default: false },
    sequence: { type: Number, default: 1 },
    applicableMonths: [{ type: Number }], // 1 to 12
    fineEnabled: { type: Boolean, default: true },
    discountAllowed: { type: Boolean, default: true },
    concessionAllowed: { type: Boolean, default: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

feeStructureItemSchema.index({ schoolId: 1, feeStructureId: 1, feeCategoryId: 1 });

module.exports = mongoose.model('FeeStructureItem', feeStructureItemSchema);
