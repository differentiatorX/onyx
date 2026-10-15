// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');

const IdempotencyRecordSchema = new Schema(
  {
    merchantId: { type: String, required: true },
    key: { type: String, required: true },
    requestHash: { type: String, required: true },
    method: String,
    path: String,
    state: { type: String, enum: ['in_progress', 'completed'], required: true },
    lockedAt: Date,
    responseStatus: Number,
    responseBody: Schema.Types.Mixed,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

IdempotencyRecordSchema.index({ merchantId: 1, key: 1 }, { unique: true });
IdempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('IdempotencyRecord', IdempotencyRecordSchema);
