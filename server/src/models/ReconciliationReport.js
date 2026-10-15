// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

const ItemSchema = new Schema(
  {
    merchantId: String,
    paymentId: String,
    providerPaymentId: String,
    ourStatus: String,
    providerStatus: String,
    ourAmount: Number,
    providerAmount: Number,
  },
  { _id: false },
);

const ReconciliationReportSchema = new Schema(
  {
    _id: { type: String, default: () => newId('rec') },
    provider: String,
    from: Date,
    to: Date,
    trigger: { type: String, enum: ['schedule', 'manual'], default: 'schedule' },
    counts: {
      matched: Number,
      amountMismatch: Number,
      statusMismatch: Number,
      missingAtProvider: Number,
      missingInOnyx: Number,
    },
    amountMismatch: [ItemSchema],
    statusMismatch: [ItemSchema],
    missingAtProvider: [ItemSchema],
    missingInOnyx: [ItemSchema],
    ledgerChecks: [{ _id: false, merchantId: String, balanced: Boolean, totalDebits: Number, totalCredits: Number, driftAccounts: [String] }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ReconciliationReportSchema.index({ createdAt: -1 });

module.exports = model('ReconciliationReport', ReconciliationReportSchema);
