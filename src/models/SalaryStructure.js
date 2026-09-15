const mongoose = require('mongoose');

const salaryStructureSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveTo: Date,
    components: [
      {
        componentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'SalaryComponent',
          required: true,
        },
        value: {
          type: Number,
          default: 0,
        },
        calculationType: String,
      },
    ],
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

salaryStructureSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
