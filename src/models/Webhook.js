const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    secret: { type: String, required: true }, // Stored hashed; raw shown once
    events: [{ type: String }], // e.g. ['student.created', 'payment.completed']
    isActive: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'FAILING'],
      default: 'ACTIVE',
    },
    headers: mongoose.Schema.Types.Mixed, // Custom headers to send
    retryCount: { type: Number, default: 3 },
    timeoutMs: { type: Number, default: 10000 },
    lastDeliveryAt: Date,
    lastDeliveryStatus: String,
    failureCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

webhookSchema.index({ schoolId: 1, isActive: 1 });

module.exports = mongoose.model('Webhook', webhookSchema);
