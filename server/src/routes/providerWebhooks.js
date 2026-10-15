// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/** Inbound provider webhooks. Raw body is required to verify the HMAC signature byte-for-byte. */
const express = require('express');
const ah = require('../lib/asyncHandler');
const providerEvents = require('../services/providerEventService');

const router = express.Router();

router.post('/:provider', express.raw({ type: '*/*', limit: '1mb' }), ah(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const result = await providerEvents.ingest(req.params.provider, raw, req.headers);
  res.status(200).json({ received: true, duplicate: result.duplicate });
}));

module.exports = router;
