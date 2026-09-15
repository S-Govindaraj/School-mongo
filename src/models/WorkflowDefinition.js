const mongoose = require('mongoose');

const workflowDefinitionSchema = new mongoose.Schema(
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
    entityType: {
      type: String,
      required: true, // e.g. 'LEAVE', 'PURCHASE_REQUEST', 'PURCHASE_ORDER', 'PAYROLL', 'ASSET_DISPOSAL', 'GATE_PASS'
    },
    steps: [
      {
        sequence: {
          type: Number,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        approverType: {
          type: String,
          enum: ['USER', 'ROLE', 'DEPARTMENT_HEAD', 'REPORTING_MANAGER', 'SPECIFIC_STAFF'],
          required: true,
        },
        approverId: mongoose.Schema.Types.ObjectId,
        required: {
          type: Boolean,
          default: true,
        },
        timeoutDays: {
          type: Number,
          default: 3,
        },
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

workflowDefinitionSchema.index({ schoolId: 1, code: 1 }, { unique: true });
workflowDefinitionSchema.index({ schoolId: 1, entityType: 1 });

module.exports = mongoose.model('WorkflowDefinition', workflowDefinitionSchema);
