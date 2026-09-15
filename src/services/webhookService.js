/**
 * Phase 9 — Webhook Service
 * Delivers webhook events with retries and HMAC signing.
 */
const crypto = require('crypto');
const Webhook = require('../models/Webhook');
const WebhookDelivery = require('../models/WebhookDelivery');

class WebhookService {
  /**
   * Generate HMAC-SHA256 signature for payload verification.
   */
  static sign(secret, payload) {
    return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  }

  /**
   * Dispatch an event to all active webhooks for a school.
   */
  static async dispatch(schoolId, eventType, payload) {
    const webhooks = await Webhook.find({
      schoolId,
      isActive: true,
      status: 'ACTIVE',
      events: eventType,
    }).lean();

    const eventId = `${eventType}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    for (const webhook of webhooks) {
      await WebhookDelivery.create({
        schoolId,
        webhookId: webhook._id,
        eventType,
        eventId,
        payload: { event: eventType, data: payload, timestamp: new Date().toISOString() },
        status: 'QUEUED',
        maxAttempts: webhook.retryCount || 3,
      });
    }

    // In production: trigger a background job / queue processor
    // For now: attempt immediate delivery (best-effort, non-blocking)
    this.processQueue(schoolId).catch(() => {}); // fire-and-forget
  }

  /**
   * Process pending deliveries for a school.
   * In production this should be a separate worker/cron job.
   */
  static async processQueue(schoolId) {
    const pending = await WebhookDelivery.find({
      schoolId,
      status: { $in: ['QUEUED', 'RETRYING'] },
      $or: [{ nextRetryAt: { $lte: new Date() } }, { nextRetryAt: { $exists: false } }],
    }).limit(20);

    for (const delivery of pending) {
      await this.attemptDelivery(delivery);
    }
  }

  static async attemptDelivery(delivery) {
    const webhook = await Webhook.findById(delivery.webhookId).lean();
    if (!webhook || !webhook.isActive) {
      delivery.status = 'FAILED';
      delivery.error = 'Webhook inactive or deleted';
      await delivery.save();
      return;
    }

    const start = Date.now();
    delivery.attemptCount += 1;
    delivery.lastAttemptAt = new Date();
    delivery.status = 'SENDING';
    await delivery.save();

    try {
      const signature = this.sign(webhook.secret, delivery.payload);
      const headers = {
        'Content-Type': 'application/json',
        'X-Signature-SHA256': signature,
        'X-Event-Type': delivery.eventType,
        'X-Event-ID': delivery.eventId,
        'X-Webhook-Attempt': String(delivery.attemptCount),
        ...(webhook.headers || {}),
      };

      // Use native fetch (Node 18+) or fallback to http module
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), webhook.timeoutMs || 10000);

      let response;
      try {
        response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(delivery.payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      delivery.duration = Date.now() - start;
      delivery.responseStatus = response.status;
      delivery.responseBody = (await response.text()).slice(0, 1000);

      if (response.ok) {
        delivery.status = 'DELIVERED';
        delivery.deliveredAt = new Date();
        await Webhook.findByIdAndUpdate(webhook._id, {
          lastDeliveryAt: new Date(),
          lastDeliveryStatus: 'DELIVERED',
          failureCount: 0,
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      delivery.error = err.message;
      delivery.duration = Date.now() - start;

      if (delivery.attemptCount >= delivery.maxAttempts) {
        delivery.status = 'DEAD_LETTER';
        await Webhook.findByIdAndUpdate(webhook._id, { $inc: { failureCount: 1 } });
        if ((webhook.failureCount || 0) + 1 >= 10) {
          await Webhook.findByIdAndUpdate(webhook._id, { status: 'FAILING' });
        }
      } else {
        delivery.status = 'RETRYING';
        // Exponential backoff: 1m, 5m, 25m
        const delay = Math.pow(5, delivery.attemptCount) * 60 * 1000;
        delivery.nextRetryAt = new Date(Date.now() + delay);
      }
    }

    await delivery.save();
  }
}

module.exports = WebhookService;
