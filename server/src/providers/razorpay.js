// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Razorpay adapter over the REST API (no SDK needed). Amounts are in paise, same as Onyx.
 * Docs: https://razorpay.com/docs/api/
 */
const env = require('../config/env');
const { hmacHex, safeEqual } = require('../lib/crypto');
const { badRequest } = require('../lib/errors');

const BASE_URL = 'https://api.razorpay.com/v1';
const STATUS_MAP = { created: 'created', authorized: 'authorized', captured: 'captured', refunded: 'captured', failed: 'failed' };

function authHeader() {
  return `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
}

async function call(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { authorization: authHeader(), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Razorpay ${method} ${path} failed: ${json?.error?.description || res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const normalize = (p) => ({ providerPaymentId: p.id, providerOrderId: p.order_id, amount: p.amount, status: STATUS_MAP[p.status] || p.status, errorReason: p.error_description });

module.exports = {
  name: 'razorpay',
  requiresExplicitCapture: true,
  asyncConfirmation: false,

  async createOrder({ paymentId, amount, currency }) {
    const order = await call('POST', '/orders', { amount, currency, receipt: paymentId, notes: { onyx_payment_id: paymentId } });
    return { providerOrderId: order.id };
  },

  checkoutConfig(payment) {
    return { provider: 'razorpay', key_id: env.RAZORPAY_KEY_ID, order_id: payment.providerOrderId, amount: payment.amount, currency: payment.currency };
  },

  /** Verifies the signature Razorpay Checkout hands to the browser on success. */
  async confirmCheckout(payment, body = {}) {
    const { razorpay_payment_id: rzpPaymentId, razorpay_order_id: rzpOrderId, razorpay_signature: signature } = body;
    if (!rzpPaymentId || !signature) throw badRequest('Missing Razorpay checkout fields');
    if (rzpOrderId !== payment.providerOrderId) throw badRequest('This checkout response belongs to a different order');
    const expected = hmacHex(env.RAZORPAY_KEY_SECRET, `${payment.providerOrderId}|${rzpPaymentId}`);
    if (!safeEqual(expected, signature)) throw badRequest('Checkout signature is invalid');
    return { providerPaymentId: rzpPaymentId, method: 'razorpay_checkout' };
  },

  async capture({ providerPaymentId, amount, currency }) {
    try {
      await call('POST', `/payments/${providerPaymentId}/capture`, { amount, currency });
      return { ok: true };
    } catch (err) {
      if (/already been captured/i.test(err.message)) return { ok: true, alreadyCaptured: true };
      throw err;
    }
  },

  async refund({ providerPaymentId, amount, refundId }) {
    const r = await call('POST', `/payments/${providerPaymentId}/refund`, { amount, receipt: refundId, notes: { onyx_refund_id: refundId } });
    return { providerRefundId: r.id };
  },

  verifyWebhook(rawBody, headers) {
    const signature = headers['x-razorpay-signature'];
    if (!signature) return false;
    return safeEqual(hmacHex(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
  },

  parseEvent(json, headers = {}) {
    const p = json?.payload?.payment?.entity || {};
    return {
      eventId: headers['x-razorpay-event-id'] || `${json.event}_${p.id}_${json.created_at}`,
      type: json.event,
      providerPaymentId: p.id,
      providerOrderId: p.order_id,
      amount: p.amount,
      status: p.status,
      errorReason: p.error_description,
    };
  },

  async fetchPayment(providerPaymentId) {
    return normalize(await call('GET', `/payments/${providerPaymentId}`));
  },

  async listPayments({ from, to }) {
    const out = [];
    const count = 100;
    for (let skip = 0; skip < 5000; skip += count) {
      const page = await call('GET', `/payments?from=${Math.floor(from / 1000)}&to=${Math.floor(to / 1000)}&count=${count}&skip=${skip}`);
      out.push(...page.items.map(normalize));
      if (page.items.length < count) break;
    }
    return out;
  },
};
