// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const env = require('../config/env');
const logger = require('../config/logger');
const { withTransaction } = require('../config/db');
const { Payment, PaymentAttempt, Merchant } = require('../models');
const { canTransition } = require('../domain/paymentStateMachine');
const { postings } = require('../domain/ledger');
const { computeFee } = require('../lib/money');
const { newId, randomString } = require('../lib/ids');
const { safeEqual } = require('../lib/crypto');
const { notFound, conflict, unprocessable } = require('../lib/errors');
const serialize = require('../lib/serialize');
const { getProvider, activeProvider } = require('../providers');
const { enqueue } = require('../queues');
const ledger = require('./ledgerService');
const outbox = require('./outboxService');
const risk = require('./riskService');

const minutesFromNow = (m) => new Date(Date.now() + m * 60000);

async function createPayment(merchant, input) {
  const _id = newId('pay');
  const email = input.customer.email.toLowerCase();
  const assessment = await risk.assess({ merchant, amount: input.amount, email });
  const provider = activeProvider();
  const now = new Date();
  const base = {
    _id,
    merchantId: merchant._id,
    amount: input.amount,
    currency: input.currency || 'INR',
    description: input.description,
    customer: { ...input.customer, email },
    metadata: input.metadata || {},
    clientSecret: `${_id}_secret_${randomString(24)}`,
    provider: provider.name,
    risk: assessment,
  };

  if (assessment.decision === 'block') {
    const blocked = await withTransaction(async (session) => {
      const [p] = await Payment.create(
        [{ ...base, status: 'blocked', failureReason: 'blocked_by_risk_rules', statusHistory: [{ status: 'blocked', at: now, reason: assessment.reasons.map((r) => r.code).join(', ') }] }],
        { session },
      );
      await outbox.enqueue({ merchantId: merchant._id, type: 'payment.blocked', objectId: p._id, data: serialize.payment(p), session });
      return p;
    });
    logger.info({ paymentId: _id, risk: assessment }, 'Payment blocked by risk rules');
    return blocked;
  }

  // Provider order is created first. If the insert below fails, the orphan order simply expires.
  const { providerOrderId } = await provider.createOrder({ paymentId: _id, amount: base.amount, currency: base.currency });
  const payment = await Payment.create({
    ...base,
    status: 'created',
    providerOrderId,
    expiresAt: minutesFromNow(env.PAYMENT_EXPIRY_MINUTES),
    statusHistory: [{ status: 'created', at: now, reason: assessment.decision === 'review' ? 'flagged_for_review' : undefined }],
  });
  await risk.recordPayment(merchant._id, email);
  return payment;
}

/**
 * Optimistic-concurrency status change. Reads the payment, checks the state machine,
 * then updates only if nobody else changed it since (version match). Invalid or stale
 * transitions are reported, not thrown, so webhook handlers can log and ignore them.
 */
async function transition(paymentId, to, { reason, set = {}, inc = {}, session = null, allowSame = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await Payment.findById(paymentId).session(session);
    if (!current) throw notFound('Payment not found');
    if (current.status === to && !allowSame) return { payment: current, changed: false, reason: `already ${to}` };
    if (!canTransition(current.status, to)) return { payment: current, changed: false, reason: `cannot move from ${current.status} to ${to}` };

    const updated = await Payment.findOneAndUpdate(
      { _id: paymentId, version: current.version },
      { $set: { status: to, ...set }, $inc: { version: 1, ...inc }, $push: { statusHistory: { status: to, at: new Date(), reason } } },
      { new: true, session },
    );
    if (updated) return { payment: updated, changed: true, from: current.status };
  }
  throw conflict('Payment was modified concurrently; retry the request');
}

async function getForMerchant(merchantId, paymentId) {
  const payment = await Payment.findOne({ _id: paymentId, merchantId });
  if (!payment) throw notFound(`No payment ${paymentId}`);
  return payment;
}

async function listForMerchant(merchantId, { status, limit = 20, cursor, q } = {}) {
  const filter = { merchantId };
  if (status) filter.status = status;
  if (q) {
    const term = q.trim();
    if (term.startsWith('pay_')) filter._id = term;
    else filter['customer.email'] = term.toLowerCase();
  }
  if (cursor) {
    const [ts, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    const at = new Date(ts);
    filter.$or = [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: id } }];
  }
  const rows = await Payment.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    data: page,
    has_more: hasMore,
    next_cursor: hasMore && last ? Buffer.from(`${last.createdAt.toISOString()}|${last._id}`).toString('base64url') : null,
  };
}

async function getCheckout(paymentId, clientSecret) {
  const payment = await Payment.findById(paymentId);
  if (!payment || !clientSecret || !safeEqual(payment.clientSecret, clientSecret)) throw notFound('This payment link is not valid');
  const merchant = await Merchant.findById(payment.merchantId).lean();
  return { payment, merchant };
}

async function confirmCheckout(paymentId, clientSecret, body) {
  const { payment } = await getCheckout(paymentId, clientSecret);
  if (payment.status !== 'created') return payment; // already confirmed: idempotent
  if (payment.expiresAt && payment.expiresAt < new Date()) {
    await expirePayment(payment._id);
    throw unprocessable('This payment link has expired', 'payment_expired');
  }

  const provider = getProvider(payment.provider);
  const result = await provider.confirmCheckout(payment, body);
  const attempt = await PaymentAttempt.create({ paymentId: payment._id, merchantId: payment.merchantId, method: result.method, providerRef: result.providerPaymentId });

  const t = await transition(payment._id, 'processing', {
    reason: 'customer_confirmed',
    set: { providerPaymentId: result.providerPaymentId, latestAttemptId: attempt._id },
  });
  if (!t.changed) {
    await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { outcome: 'superseded' } });
    return t.payment;
  }

  if (provider.asyncConfirmation) {
    await enqueue(
      'payments',
      'mockbank-process',
      { paymentId: payment._id, providerPaymentId: result.providerPaymentId, providerOrderId: payment.providerOrderId, amount: payment.amount, simulate: result.simulate },
      { jobId: `mock-${attempt._id}`, delay: 1200 + Math.floor(Math.random() * 1800), attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
    );
  }
  return t.payment;
}

async function markAuthorized(paymentId, { providerPaymentId, source }) {
  const t = await transition(paymentId, 'authorized', {
    reason: `authorized_via_${source}`,
    set: providerPaymentId ? { providerPaymentId } : {},
  });
  if (t.changed && getProvider(t.payment.provider).requiresExplicitCapture) {
    await enqueue('payments', 'capture', { paymentId }, { jobId: `capture-${paymentId}`, attempts: 5, backoff: { type: 'exponential', delay: 3000 } });
  }
  return t;
}

/** Status change, ledger posting and outbox event commit together or not at all. */
async function markCaptured(paymentId, { amount, providerPaymentId, source }) {
  return withTransaction(async (session) => {
    const p = await Payment.findById(paymentId).session(session);
    if (!p) throw notFound('Payment not found');
    if (amount != null && amount !== p.amount) {
      logger.error({ paymentId, expected: p.amount, got: amount }, 'Provider amount mismatch; not capturing');
      return { payment: p, changed: false, reason: `amount mismatch (provider ${amount}, expected ${p.amount})` };
    }
    const merchant = await Merchant.findById(p.merchantId).session(session).lean();
    const fee = computeFee(p.amount, merchant?.feeBps ?? env.PLATFORM_FEE_BPS);

    const t = await transition(paymentId, 'captured', {
      reason: `captured_via_${source}`,
      set: { capturedAt: new Date(), fee, ...(providerPaymentId ? { providerPaymentId } : {}) },
      session,
    });
    if (!t.changed) return t;

    await ledger.post({
      merchantId: p.merchantId,
      type: 'capture',
      ref: p._id,
      paymentId: p._id,
      idempotencyKey: `capture:${p._id}`,
      lines: postings.capture({ amount: p.amount, fee }),
      session,
    });
    if (p.latestAttemptId) await PaymentAttempt.updateOne({ _id: p.latestAttemptId }, { $set: { outcome: 'succeeded' } }, { session });
    await outbox.enqueue({ merchantId: p.merchantId, type: 'payment.captured', objectId: p._id, data: serialize.payment(t.payment), session });
    return t;
  });
}

async function markFailed(paymentId, { reason, source }) {
  const result = await withTransaction(async (session) => {
    const t = await transition(paymentId, 'failed', { reason: `failed_via_${source}`, set: { failureReason: reason }, session });
    if (!t.changed) return t;
    if (t.payment.latestAttemptId) await PaymentAttempt.updateOne({ _id: t.payment.latestAttemptId }, { $set: { outcome: 'failed', error: reason } }, { session });
    await outbox.enqueue({ merchantId: t.payment.merchantId, type: 'payment.failed', objectId: t.payment._id, data: serialize.payment(t.payment), session });
    return t;
  });
  if (result.changed) await risk.recordFailure(result.payment.merchantId, result.payment.customer?.email);
  return result;
}

async function expirePayment(paymentId) {
  return withTransaction(async (session) => {
    const t = await transition(paymentId, 'expired', { reason: 'checkout_window_elapsed', session });
    if (t.changed) await outbox.enqueue({ merchantId: t.payment.merchantId, type: 'payment.expired', objectId: t.payment._id, data: serialize.payment(t.payment), session });
    return t;
  });
}

async function expireStale() {
  const stale = await Payment.find({ status: { $in: ['created', 'authorized'] }, expiresAt: { $lt: new Date() } }, { _id: 1 }).limit(200).lean();
  for (const { _id } of stale) await expirePayment(_id);
  return { expired: stale.length };
}

/** Razorpay flow: capture an authorized payment through the provider API, then book it. */
async function captureWithProvider(paymentId) {
  const p = await Payment.findById(paymentId).lean();
  if (!p || p.status !== 'authorized') return { skipped: true };
  await getProvider(p.provider).capture({ providerPaymentId: p.providerPaymentId, amount: p.amount, currency: p.currency });
  return markCaptured(paymentId, { amount: p.amount, providerPaymentId: p.providerPaymentId, source: 'capture_api' });
}

/**
 * Safety net for webhooks that never arrive: ask the provider directly about payments
 * that have been processing for too long.
 */
async function pollStuck() {
  const cutoff = new Date(Date.now() - env.STUCK_PAYMENT_SECONDS * 1000);
  const stuck = await Payment.find({ status: { $in: ['processing', 'authorized'] }, updatedAt: { $lt: cutoff }, providerPaymentId: { $ne: null } }).limit(50).lean();
  let recovered = 0;
  for (const p of stuck) {
    try {
      const remote = await getProvider(p.provider).fetchPayment(p.providerPaymentId);
      if (!remote) continue;
      let r;
      if (remote.status === 'captured') r = await markCaptured(p._id, { amount: remote.amount, providerPaymentId: remote.providerPaymentId, source: 'status_poll' });
      else if (remote.status === 'failed') r = await markFailed(p._id, { reason: remote.errorReason || 'provider_declined', source: 'status_poll' });
      else if (remote.status === 'authorized') r = await markAuthorized(p._id, { providerPaymentId: remote.providerPaymentId, source: 'status_poll' });
      if (r?.changed) {
        recovered += 1;
        logger.warn({ paymentId: p._id, status: remote.status }, 'Recovered a payment whose webhook never arrived');
      }
    } catch (err) {
      logger.error({ err: err.message, paymentId: p._id }, 'Status poll failed');
    }
  }
  return { checked: stuck.length, recovered };
}

module.exports = {
  createPayment,
  transition,
  getForMerchant,
  listForMerchant,
  getCheckout,
  confirmCheckout,
  markAuthorized,
  markCaptured,
  markFailed,
  expirePayment,
  expireStale,
  captureWithProvider,
  pollStuck,
};
