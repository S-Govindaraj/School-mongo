const mongoose = require('mongoose');

const purchaseRequestSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    requestCode: {
      type: String,
      required: true,
      trim: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    items: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'InventoryItem',
        },
        itemName: String,
        quantity: {
          type: Number,
          required: true,
        },
        estimatedCost: {
          type: Number,
          default: 0,
        },
      },
    ],
    requiredDate: String,
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
    },
    reason: String,
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'SUBMITTED',
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
  },
  { timestamps: true }
);

purchaseRequestSchema.index({ schoolId: 1, requestCode: 1 }, { unique: true });
purchaseRequestSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('PurchaseRequest', purchaseRequestSchema);
