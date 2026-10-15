// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/** Hosted checkout, opened by the customer. Authorised by the payment's client secret. */
const express = require('express');
const ah = require('../lib/asyncHandler');
const rateLimit = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');
const payments = require('../services/paymentService');
const { getProvider } = require('../providers');

const router = express.Router();
router.use(rateLimit({ capacity: 30, refillPerSec: 1, prefix: 'checkout', keyFn: (req) => req.ip }));

const view = (payment, merchant) => ({
  id: payment._id,
  amount: payment.amount,
  currency: payment.currency,
  status: payment.status,
  description: payment.description || null,
  merchant_name: merchant?.name || 'Merchant',
  customer_email: payment.customer?.email || null,
  failure_reason: payment.failureReason || null,
  expires_at: payment.expiresAt,
  provider_config: payment.status === 'created' ? getProvider(payment.provider).checkoutConfig(payment) : null,
});

router.get('/:id', ah(async (req, res) => {
  const { payment, merchant } = await payments.getCheckout(req.params.id, req.query.secret);
  res.json(view(payment, merchant));
}));

router.post('/:id/confirm', validate(schemas.confirmCheckout), ah(async (req, res) => {
  const payment = await payments.confirmCheckout(req.params.id, req.query.secret, req.validated);
  const { merchant } = await payments.getCheckout(req.params.id, req.query.secret);
  res.json(view(payment, merchant));
}));

module.exports = router;
