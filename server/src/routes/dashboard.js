// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/** Dashboard API used by the React app. JWT auth. */
const express = require('express');
const ah = require('../lib/asyncHandler');
const serialize = require('../lib/serialize');
const { notFound } = require('../lib/errors');
const jwtAuth = require('../middleware/jwtAuth');
const rateLimit = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');
const merchants = require('../services/merchantService');
const payments = require('../services/paymentService');
const refunds = require('../services/refundService');
const webhooks = require('../services/webhookService');
const ledger = require('../services/ledgerService');
const stats = require('../services/statsService');
const settlements = require('../services/settlementService');
const reconciliation = require('../services/reconciliationService');
const { PaymentAttempt, JournalEntry, ProviderEvent, WebhookDelivery, WebhookEndpoint, Settlement, Refund } = require('../models');

const router = express.Router();
const authLimiter = rateLimit({ capacity: 10, refillPerSec: 0.2, prefix: 'auth', keyFn: (req) => req.ip });

router.post('/auth/register', authLimiter, validate(schemas.register), ah(async (req, res) => {
  const { merchant, apiKey, token } = await merchants.register(req.validated);
  res.status(201).json({ token, merchant: serialize.merchant(merchant), api_key: apiKey });
}));

router.post('/auth/login', authLimiter, validate(schemas.login), ah(async (req, res) => {
  const { merchant, token } = await merchants.login(req.validated);
  res.json({ token, merchant: serialize.merchant(merchant) });
}));

router.use(jwtAuth);

router.get('/me', (req, res) => res.json(serialize.merchant(req.merchant)));

router.get('/overview', ah(async (req, res) => {
  const [summary, recent] = await Promise.all([stats.overview(req.merchant._id), payments.listForMerchant(req.merchant._id, { limit: 8 })]);
  res.json({ ...summary, recent_payments: recent.data.map(serialize.payment) });
}));

router.get('/payments', validate(schemas.listPayments, 'query'), ah(async (req, res) => {
  const page = await payments.listForMerchant(req.merchant._id, req.validated);
  res.json({ data: page.data.map(serialize.payment), has_more: page.has_more, next_cursor: page.next_cursor });
}));

router.post('/payments', validate(schemas.createPayment), ah(async (req, res) => {
  res.status(201).json(serialize.payment(await payments.createPayment(req.merchant, req.validated)));
}));

router.get('/payments/:id', ah(async (req, res) => {
  const payment = await payments.getForMerchant(req.merchant._id, req.params.id);
  const [attempts, refundRows, journal, providerEvents, deliveries] = await Promise.all([
    PaymentAttempt.find({ paymentId: payment._id }).sort({ createdAt: 1 }).lean(),
    Refund.find({ paymentId: payment._id }).sort({ createdAt: -1 }).lean(),
    JournalEntry.find({ paymentId: payment._id }).sort({ createdAt: 1 }).lean(),
    ProviderEvent.find({ paymentId: payment._id }).sort({ createdAt: 1 }).lean(),
    WebhookDelivery.find({ merchantId: req.merchant._id, objectId: { $in: [payment._id] } }).sort({ createdAt: 1 }).lean(),
  ]);
  const refundIds = refundRows.map((r) => r._id);
  const refundDeliveries = refundIds.length ? await WebhookDelivery.find({ merchantId: req.merchant._id, objectId: { $in: refundIds } }).lean() : [];
  res.json({
    payment: serialize.payment(payment),
    attempts: attempts.map(serialize.attempt),
    refunds: refundRows.map(serialize.refund),
    journal: journal.map(serialize.journalEntry),
    provider_events: providerEvents.map(serialize.providerEvent),
    deliveries: [...deliveries, ...refundDeliveries].sort((a, b) => a.createdAt - b.createdAt).map(serialize.delivery),
  });
}));

router.post('/payments/:id/refunds', validate(schemas.createRefund), ah(async (req, res) => {
  res.status(201).json(serialize.refund(await refunds.createRefund(req.merchant._id, req.params.id, req.validated)));
}));

router.get('/ledger', ah(async (req, res) => {
  const [accounts, journal, integrity] = await Promise.all([
    ledger.listAccounts(req.merchant._id),
    JournalEntry.find({ merchantId: req.merchant._id }).sort({ createdAt: -1 }).limit(50).lean(),
    ledger.verifyIntegrity(req.merchant._id),
  ]);
  res.json({ accounts, journal: journal.map(serialize.journalEntry), integrity });
}));

router.get('/webhooks', ah(async (req, res) => {
  const filter = { merchantId: req.merchant._id };
  if (req.query.status === 'failing') filter.status = { $in: ['retrying', 'dead', 'failed'] };
  const [endpoints, deliveries] = await Promise.all([
    WebhookEndpoint.find({ merchantId: req.merchant._id }).sort({ createdAt: 1 }).lean(),
    WebhookDelivery.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  res.json({ endpoints: endpoints.map((e) => serialize.endpoint(e)), deliveries: deliveries.map(serialize.delivery) });
}));

router.post('/webhooks/endpoints', validate(schemas.webhookEndpoint), ah(async (req, res) => {
  res.status(201).json(serialize.endpoint(await webhooks.createEndpoint(req.merchant._id, req.validated), { revealSecret: true }));
}));

router.post('/webhooks/endpoints/:id/reveal', ah(async (req, res) => {
  const ep = await WebhookEndpoint.findOne({ _id: req.params.id, merchantId: req.merchant._id }).lean();
  if (!ep) throw notFound('Webhook endpoint not found');
  res.json(serialize.endpoint(ep, { revealSecret: true }));
}));

router.delete('/webhooks/endpoints/:id', ah(async (req, res) => {
  await webhooks.deleteEndpoint(req.merchant._id, req.params.id);
  res.json({ id: req.params.id, deleted: true });
}));

router.post('/webhooks/deliveries/:id/replay', ah(async (req, res) => {
  res.json(serialize.delivery(await webhooks.replay(req.merchant._id, req.params.id)));
}));

router.get('/settlements', ah(async (req, res) => {
  const rows = await Settlement.find({ merchantId: req.merchant._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ data: rows.map(serialize.settlement) });
}));

router.post('/settlements/run', ah(async (req, res) => {
  const s = await settlements.settleMerchant(req.merchant._id);
  res.json({ settlement: s ? serialize.settlement(s) : null });
}));

router.get('/reconciliation', ah(async (req, res) => {
  res.json({ data: await reconciliation.latestForMerchant(req.merchant._id) });
}));

router.post('/reconciliation/run', ah(async (req, res) => {
  await reconciliation.run({ trigger: 'manual' });
  const [latest] = await reconciliation.latestForMerchant(req.merchant._id, 1);
  res.json({ report: latest });
}));

router.get('/keys', ah(async (req, res) => {
  res.json({ data: (await merchants.listApiKeys(req.merchant._id)).map(serialize.apiKey) });
}));

router.post('/keys/roll', ah(async (req, res) => {
  res.json({ api_key: await merchants.rollApiKey(req.merchant._id) });
}));

module.exports = router;
