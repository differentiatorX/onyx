// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Schema, model } = require('mongoose');
const { newId } = require('../lib/ids');

const WebhookEndpointSchema = new Schema(
  {
    _id: { type: String, default: () => newId('we') },
    merchantId: { type: String, required: true, index: true },
    url: { type: String, required: true },
    secret: { type: String, required: true },
    events: { type: [String], default: ['*'] },
    active: { type: Boolean, default: true },
    description: String,
  },
  { timestamps: true },
);

module.exports = model('WebhookEndpoint', WebhookEndpointSchema);
