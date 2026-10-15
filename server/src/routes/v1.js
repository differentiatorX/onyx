// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Public merchant API. Authenticated with secret keys, rate limited per key,
 * and every POST accepts an Idempotency-Key.
 */
const express = require('express');
const ah = require('../lib/asyncHandler');
const serialize = require('../lib/serialize');
const { notFound } = require('../lib/errors');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const rateLimit = require('../middleware/rateLimit');
const idempotency = require('../middleware/idempotency');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');
const payments = require('../services/paymentService');
const refunds = require('../services/refundService');
const webhooks = require('../services/webhookService');
const ledger = require('../services/ledgerService');
const { Refund, WebhookEndpoint } = require('../models');

const router = express.Router();
router.use(apiKeyAuth, rateLimit(), idempotency());

router.post('/payments', validate(schemas.createPayment), ah(async (req, res) => {
  const payment = await payments.createPayment(req.merchant, req.validated);
  res.status(201).json(serialize.payment(payment));
}));

router.get('/payments', validate(schemas.listPayments, 'query'), ah(async (req, res) => {
  const page = await payments.listForMerchant(req.merchant._id, req.validated);
  res.json({ object: 'list', data: page.data.map(serialize.payment), has_more: page.has_more, next_cursor: page.next_cursor });
}));

router.get('/payments/:id', ah(async (req, res) => {
  res.json(serialize.payment(await payments.getForMerchant(req.merchant._id, req.params.id)));
}));

router.post('/payments/:id/refunds', validate(schemas.createRefund), ah(async (req, res) => {
  const refund = await refunds.createRefund(req.merchant._id, req.params.id, req.validated);
  res.status(201).json(serialize.refund(refund));
}));

router.get('/payments/:id/refunds', ah(async (req, res) => {
  const rows = await refunds.listForPayment(req.merchant._id, req.params.id);
  res.json({ object: 'list', data: rows.map(serialize.refund) });
}));

router.get('/refunds/:id', ah(async (req, res) => {
  const r = await Refund.findOne({ _id: req.params.id, merchantId: req.merchant._id }).lean();
  if (!r) throw notFound(`No refund ${req.params.id}`);
  res.json(serialize.refund(r));
}));

router.get('/balance', ah(async (req, res) => {
  const b = await ledger.getBalances(req.merchant._id);
  res.json({ object: 'balance', currency: 'INR', available_for_payout: b.merchant_payable, fees_paid: b.fee_revenue });
}));

router.post('/webhook_endpoints', validate(schemas.webhookEndpoint), ah(async (req, res) => {
  const ep = await webhooks.createEndpoint(req.merchant._id, req.validated);
  res.status(201).json(serialize.endpoint(ep, { revealSecret: true }));
}));

router.get('/webhook_endpoints', ah(async (req, res) => {
  const rows = await WebhookEndpoint.find({ merchantId: req.merchant._id }).lean();
  res.json({ object: 'list', data: rows.map((e) => serialize.endpoint(e)) });
}));

router.delete('/webhook_endpoints/:id', ah(async (req, res) => {
  await webhooks.deleteEndpoint(req.merchant._id, req.params.id);
  res.json({ id: req.params.id, deleted: true });
}));

module.exports = router;
