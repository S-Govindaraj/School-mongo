const mongoose = require('mongoose');

const webhookDeliverySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    webhookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Webhook', required: true, index: true },
    eventType: { type: String, required: true, index: true },
    eventId: { type: String, required: true }, // Unique per event for idempotency
    payload: mongoose.Schema.Types.Mixed,
    status: {
      type: String,
      enum: ['QUEUED', 'SENDING', 'DELIVERED', 'FAILED', 'RETRYING', 'DEAD_LETTER'],
      default: 'QUEUED',
      index: true,
    },
    responseStatus: Number,
    responseBody: String,
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextRetryAt: Date,
    lastAttemptAt: Date,
    deliveredAt: Date,
    duration: Number, // ms
    error: String,
  },
  { timestamps: true }
);

webhookDeliverySchema.index({ schoolId: 1, eventType: 1, createdAt: -1 });
webhookDeliverySchema.index({ status: 1, nextRetryAt: 1 }); // For retry job

module.exports = mongoose.model('WebhookDelivery', webhookDeliverySchema);
