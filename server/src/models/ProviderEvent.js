// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

/** Inbound webhooks from Razorpay / mock bank. Unique (provider, eventId) deduplicates retries. */
const ProviderEventSchema = new Schema(
  {
    _id: { type: String, default: () => newId('pev') },
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: String,
    payload: Schema.Types.Mixed,
    normalized: Schema.Types.Mixed,
    status: { type: String, enum: ['received', 'processed', 'ignored', 'failed'], default: 'received' },
    note: String,
    paymentId: { type: String, index: true },
    duplicateCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ProviderEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
ProviderEventSchema.index({ status: 1, createdAt: 1 });

module.exports = model('ProviderEvent', ProviderEventSchema);
