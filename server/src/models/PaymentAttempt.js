// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

const PaymentAttemptSchema = new Schema(
  {
    _id: { type: String, default: () => newId('att') },
    paymentId: { type: String, required: true, index: true },
    merchantId: { type: String, required: true },
    method: String,
    providerRef: String,
    outcome: { type: String, enum: ['pending', 'succeeded', 'failed', 'superseded'], default: 'pending' },
    error: String,
  },
  { timestamps: true },
);

module.exports = model('PaymentAttempt', PaymentAttemptSchema);
