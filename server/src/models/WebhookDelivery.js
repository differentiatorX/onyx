// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

const AttemptSchema = new Schema(
  { at: Date, attemptNumber: Number, statusCode: Number, error: String, durationMs: Number },
  { _id: false },
);

const WebhookDeliverySchema = new Schema(
  {
    _id: { type: String, default: () => newId('whd') },
    merchantId: { type: String, required: true },
    endpointId: { type: String, required: true },
    eventId: { type: String, required: true },
    eventType: String,
    objectId: { type: String, index: true },
    url: String,
    status: { type: String, enum: ['pending', 'retrying', 'succeeded', 'dead', 'failed'], default: 'pending' },
    attempts: [AttemptSchema],
    attemptCount: { type: Number, default: 0 },
    lastError: String,
    lastAttemptAt: Date,
    deliveredAt: Date,
  },
  { timestamps: true },
);

WebhookDeliverySchema.index({ eventId: 1, endpointId: 1 }, { unique: true });
WebhookDeliverySchema.index({ merchantId: 1, createdAt: -1 });

module.exports = model('WebhookDelivery', WebhookDeliverySchema);
