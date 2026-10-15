// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

const SettlementSchema = new Schema(
  {
    _id: { type: String, default: () => newId('stl') },
    merchantId: { type: String, required: true, index: true },
    paymentIds: [String],
    paymentCount: Number,
    gross: Number,
    fees: Number,
    refunds: Number,
    providerSettled: Number,
    payout: Number,
    status: { type: String, enum: ['paid'], default: 'paid' },
  },
  { timestamps: true },
);

module.exports = model('Settlement', SettlementSchema);
