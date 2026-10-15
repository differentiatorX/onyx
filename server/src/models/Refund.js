// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

const RefundSchema = new Schema(
  {
    _id: { type: String, default: () => newId('rfnd') },
    paymentId: { type: String, required: true, index: true },
    merchantId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, maxlength: 255 },
    status: { type: String, enum: ['pending', 'succeeded', 'failed'], default: 'pending' },
    providerRefundId: String,
    attempts: { type: Number, default: 0 },
    lastAttemptAt: Date,
    failureReason: String,
    succeededAt: Date,
    needsAttention: { type: Boolean, default: false },
  },
  { timestamps: true },
);

RefundSchema.index({ status: 1, createdAt: 1 });

module.exports = model('Refund', RefundSchema);
