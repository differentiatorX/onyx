// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const env = require('../config/env');
const { notFound } = require('../lib/errors');

const providers = { mockbank: require('./mockbank') };
if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) providers.razorpay = require('./razorpay');

/**
 * Adapter contract every provider implements:
 *   createOrder, checkoutConfig, confirmCheckout, capture, refund,
 *   verifyWebhook, parseEvent, fetchPayment, listPayments
 * Business logic never branches on the provider name.
 */
function getProvider(name = env.PAYMENT_PROVIDER) {
  const provider = providers[name];
  if (!provider) throw notFound(`Payment provider "${name}" is not configured`);
  return provider;
}

module.exports = { getProvider, activeProvider: () => getProvider(env.PAYMENT_PROVIDER) };
