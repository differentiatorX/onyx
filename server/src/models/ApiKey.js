// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

/** Only the SHA-256 of a secret key is stored. The plain key is shown once at creation. */
const ApiKeySchema = new Schema(
  {
    _id: { type: String, default: () => newId('key') },
    merchantId: { type: String, required: true, index: true },
    hash: { type: String, required: true, unique: true },
    displayPrefix: { type: String, required: true },
    mode: { type: String, enum: ['test', 'live'], default: 'test' },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = model('ApiKey', ApiKeySchema);
