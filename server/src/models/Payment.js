// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');
const { STATUSES } = require('../domain/paymentStateMachine');

const StatusChangeSchema = new Schema({ status: String, at: Date, reason: String }, { _id: false });

const RiskSchema = new Schema(
  {
    score: Number,
    decision: { type: String, enum: ['allow', 'review', 'block'] },
    reasons: [{ _id: false, code: String, points: Number, message: String }],
  },
  { _id: false },
);

const PaymentSchema = new Schema(
  {
    _id: { type: String, default: () => newId('pay') },
    merchantId: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: STATUSES, required: true },
    description: { type: String, maxlength: 255 },
    customer: {
      email: { type: String, lowercase: true, trim: true },
      name: String,
      contact: String,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    clientSecret: { type: String, required: true },
    provider: { type: String, required: true },
    providerOrderId: { type: String, index: true, sparse: true },
    providerPaymentId: { type: String, index: true, sparse: true },
    latestAttemptId: String,
    fee: { type: Number, default: null },
    amountRefunded: { type: Number, default: 0 },
    amountRefundPending: { type: Number, default: 0 },
    risk: RiskSchema,
    failureReason: String,
    capturedAt: Date,
    expiresAt: Date,
    settlementId: { type: String, default: null },
    // Optimistic concurrency: every status change requires the version it read.
    version: { type: Number, default: 0 },
    statusHistory: [StatusChangeSchema],
  },
  { timestamps: true },
);

PaymentSchema.index({ merchantId: 1, createdAt: -1, _id: -1 });
PaymentSchema.index({ status: 1, expiresAt: 1 });
PaymentSchema.index({ status: 1, updatedAt: 1 });
PaymentSchema.index({ merchantId: 1, settlementId: 1, status: 1, capturedAt: 1 });
PaymentSchema.index({ merchantId: 1, 'customer.email': 1 });

module.exports = model('Payment', PaymentSchema);
