// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');

/** The mock bank's own records. Reconciliation compares Onyx against these. */
const MockProviderTxnSchema = new Schema(
  {
    _id: { type: String },
    orderId: { type: String, index: true },
    paymentId: String,
    amount: Number,
    status: { type: String, enum: ['captured', 'failed'] },
    failureReason: String,
    silent: { type: Boolean, default: false },
    amountRefunded: { type: Number, default: 0 },
    refunds: [{ _id: false, refundId: String, providerRefundId: String, amount: Number, at: Date }],
  },
  { timestamps: true },
);

module.exports = model('MockProviderTxn', MockProviderTxnSchema);
