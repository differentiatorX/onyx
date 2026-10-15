// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');

/** _id is "<merchantId>:<code>". balance is on the account's normal side, in paise. */
const LedgerAccountSchema = new Schema(
  {
    _id: { type: String },
    merchantId: { type: String, required: true, index: true },
    code: { type: String, required: true },
    type: { type: String, enum: ['asset', 'liability', 'revenue', 'expense', 'equity'], required: true },
    name: String,
    currency: { type: String, default: 'INR' },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = model('LedgerAccount', LedgerAccountSchema);
