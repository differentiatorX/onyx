// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * A deliberately unreliable fake bank, so every failure mode can be demonstrated without
 * a real account: declines, banks that never call back, duplicate webhooks, out-of-order
 * webhooks and flaky refunds. It talks to Onyx only through signed HTTP webhooks,
 * exactly like Razorpay does.
 */
const env = require('../config/env');
const logger = require('../config/logger');
const { MockProviderTxn } = require('../models');
const { newId } = require('../lib/ids');
const { signWebhook, verifyWebhookSignature } = require('../lib/crypto');

const NAME = 'mockbank';
const OUTCOMES = ['auto', 'success', 'failure', 'timeout'];
const DECLINE_REASONS = ['insufficient_funds', 'card_declined', 'bank_rejected', 'authentication_failed'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickOutcome(requested) {
  if (requested && requested !== 'auto') return requested;
  const r = Math.random();
  if (r < env.MOCKBANK_FAILURE_RATE) return 'failure';
  if (r < env.MOCKBANK_FAILURE_RATE + env.MOCKBANK_TIMEOUT_RATE) return 'timeout';
  return 'success';
}

async function sendWebhook(event) {
  const body = JSON.stringify(event);
  const res = await fetch(`${env.INTERNAL_API_URL}/webhooks/${NAME}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mockbank-signature': signWebhook(env.MOCKBANK_WEBHOOK_SECRET, body) },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Onyx rejected mock bank webhook with ${res.status}`);
}

module.exports = {
  name: NAME,
  requiresExplicitCapture: false,
  asyncConfirmation: true,

  async createOrder() {
    return { providerOrderId: newId('mb_order', 14) };
  },

  checkoutConfig() {
    return { provider: NAME, outcomes: OUTCOMES };
  },

  async confirmCheckout(payment, body = {}) {
    const simulate = OUTCOMES.includes(body.simulate) ? body.simulate : 'auto';
    return { providerPaymentId: newId('mb_pay', 14), method: body.method || 'card', simulate };
  },

  async capture() {
    return { ok: true };
  },

  /** Runs in the worker after the customer confirms. Safe to retry: the bank record is upserted. */
  async simulate({ paymentId, providerPaymentId, providerOrderId, amount, simulate }) {
    const outcome = pickOutcome(simulate);
    await MockProviderTxn.updateOne(
      { _id: providerPaymentId },
      {
        $setOnInsert: {
          orderId: providerOrderId,
          paymentId,
          amount,
          status: outcome === 'failure' ? 'failed' : 'captured',
          failureReason: outcome === 'failure' ? DECLINE_REASONS[Math.floor(Math.random() * DECLINE_REASONS.length)] : undefined,
          silent: outcome === 'timeout',
          amountRefunded: 0,
        },
      },
      { upsert: true },
    );
    const txn = await MockProviderTxn.findById(providerPaymentId).lean();
    if (txn.silent) {
      logger.info({ paymentId }, 'mockbank: simulating a bank that never sends a webhook');
      return { outcome: 'timeout', sent: 0 };
    }

    const data = { payment_id: txn._id, order_id: txn.orderId, amount: txn.amount };
    const event = (type, status, extra = {}) => ({ id: `mbevt_${txn._id}_${type}`, type, created: Math.floor(Date.now() / 1000), data: { ...data, status, ...extra } });

    let events;
    if (txn.status === 'failed') {
      events = [event('payment.failed', 'failed', { error_reason: txn.failureReason })];
    } else {
      events = [event('payment.authorized', 'authorized'), event('payment.captured', 'captured')];
      if (Math.random() < env.MOCKBANK_REORDER_RATE) events.reverse();
      if (Math.random() < env.MOCKBANK_DUPLICATE_RATE) events.push({ ...events[events.length - 1] });
    }

    for (const e of events) {
      await sendWebhook(e);
      await sleep(150);
    }
    return { outcome: txn.status, sent: events.length };
  },

  /** Idempotent per refundId, like a well-behaved bank API. */
  async refund({ providerPaymentId, amount, refundId }) {
    const existing = await MockProviderTxn.findOne({ _id: providerPaymentId, 'refunds.refundId': refundId }, { 'refunds.$': 1 }).lean();
    if (existing) return { providerRefundId: existing.refunds[0].providerRefundId };

    if (Math.random() < env.MOCKBANK_REFUND_FAILURE_RATE) throw new Error('mockbank: refund gateway timed out');

    const providerRefundId = newId('mb_rfnd', 14);
    const res = await MockProviderTxn.updateOne(
      {
        _id: providerPaymentId,
        status: 'captured',
        'refunds.refundId': { $ne: refundId },
        $expr: { $lte: [{ $add: ['$amountRefunded', amount] }, '$amount'] },
      },
      { $inc: { amountRefunded: amount }, $push: { refunds: { refundId, providerRefundId, amount, at: new Date() } } },
    );
    if (res.modifiedCount === 1) return { providerRefundId };

    const again = await MockProviderTxn.findOne({ _id: providerPaymentId, 'refunds.refundId': refundId }, { 'refunds.$': 1 }).lean();
    if (again) return { providerRefundId: again.refunds[0].providerRefundId };
    throw new Error('mockbank: refund rejected (unknown payment or amount exceeds captured)');
  },

  verifyWebhook(rawBody, headers) {
    return verifyWebhookSignature(headers['x-mockbank-signature'], rawBody, env.MOCKBANK_WEBHOOK_SECRET);
  },

  parseEvent(json) {
    const d = json.data || {};
    return {
      eventId: json.id,
      type: json.type,
      providerPaymentId: d.payment_id,
      providerOrderId: d.order_id,
      amount: d.amount,
      status: d.status,
      errorReason: d.error_reason,
    };
  },

  async fetchPayment(providerPaymentId) {
    const t = await MockProviderTxn.findById(providerPaymentId).lean();
    if (!t) return null;
    return { providerPaymentId: t._id, providerOrderId: t.orderId, amount: t.amount, status: t.status, errorReason: t.failureReason };
  },

  async listPayments({ from, to }) {
    const rows = await MockProviderTxn.find({ createdAt: { $gte: from, $lte: to } }).lean();
    return rows.map((t) => ({ providerPaymentId: t._id, providerOrderId: t.orderId, amount: t.amount, status: t.status }));
  },
};
