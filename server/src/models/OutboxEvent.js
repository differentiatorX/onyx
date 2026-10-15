// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

/**
 * Transactional outbox. Written in the same transaction as the state change,
 * then relayed to webhook deliveries by a worker. No state change can commit
 * without its event, and no event can exist for a change that rolled back.
 */
const OutboxEventSchema = new Schema(
  {
    _id: { type: String, default: () => newId('evt') },
    merchantId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    objectId: { type: String, index: true },
    data: Schema.Types.Mixed,
    published: { type: Boolean, default: false },
    publishedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

OutboxEventSchema.index({ published: 1, createdAt: 1 });

module.exports = model('OutboxEvent', OutboxEventSchema);
