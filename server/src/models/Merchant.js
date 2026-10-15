// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

const MerchantSchema = new Schema(
  {
    _id: { type: String, default: () => newId('mer') },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    feeBps: { type: Number, default: null },
    maxPaymentAmount: { type: Number, default: 50000000 },
  },
  { timestamps: true },
);

module.exports = model('Merchant', MerchantSchema);
