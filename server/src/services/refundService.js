// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const logger = require('../config/logger');
const { withTransaction } = require('../config/db');
const { Payment, Refund } = require('../models');
const { REFUNDABLE_STATES } = require('../domain/paymentStateMachine');
const { postings } = require('../domain/ledger');
const { notFound, conflict, unprocessable } = require('../lib/errors');
const serialize = require('../lib/serialize');
const { getProvider } = require('../providers');
const { enqueue } = require('../queues');
const ledger = require('./ledgerService');
const outbox = require('./outboxService');
const { transition } = require('./paymentService');

/**
 * Reserves the refund amount atomically on the payment (amountRefundPending), so two
 * concurrent refunds can never exceed what was captured. The provider call happens
 * later in a worker with retries.
 */
async function createRefund(merchantId, paymentId, { amount, reason }) {
  const payment = await Payment.findOne({ _id: paymentId, merchantId }).lean();
  if (!payment) throw notFound(`No payment ${paymentId}`);
  if (!REFUNDABLE_STATES.includes(payment.status)) {
    throw unprocessable(`Only captured payments can be refunded; this one is ${payment.status}`, 'payment_not_refundable');
  }
  const remaining = payment.amount - payment.amountRefunded - payment.amountRefundPending;
  const refundAmount = amount ?? remaining;
  if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
    throw unprocessable(`Refund amount must be between 1 and ${remaining} paise`, 'refund_amount_invalid');
  }

  const refund = await withTransaction(async (session) => {
    const reserved = await Payment.findOneAndUpdate(
      {
        _id: paymentId,
        status: { $in: REFUNDABLE_STATES },
        $expr: { $lte: [{ $add: ['$amountRefunded', '$amountRefundPending', refundAmount] }, '$amount'] },
      },
      { $inc: { amountRefundPending: refundAmount } },
      { new: true, session },
    );
    if (!reserved) throw conflict('Another refund changed the refundable amount; check the payment and retry', 'refund_conflict');
    const [r] = await Refund.create([{ paymentId, merchantId, amount: refundAmount, reason, status: 'pending' }], { session });
    return r;
  });

  await enqueue('refunds', 'process', { refundId: refund._id }, { jobId: refund._id, attempts: 6, backoff: { type: 'exponential', delay: 3000 } });
  return refund;
}

async function processRefund(refundId) {
  const refund = await Refund.findById(refundId).lean();
  if (!refund || refund.status !== 'pending') return { skipped: true };
  const payment = await Payment.findById(refund.paymentId).lean();

  await Refund.updateOne({ _id: refundId }, { $inc: { attempts: 1 }, $set: { lastAttemptAt: new Date() } });
  // Throws on provider failure; BullMQ retries with exponential backoff.
  const { providerRefundId } = await getProvider(payment.provider).refund({
    providerPaymentId: payment.providerPaymentId,
    amount: refund.amount,
    refundId: refund._id,
  });

  return withTransaction(async (session) => {
    const r = await Refund.findOneAndUpdate(
      { _id: refundId, status: 'pending' },
      { $set: { status: 'succeeded', providerRefundId, succeededAt: new Date() } },
      { new: true, session },
    );
    if (!r) return { skipped: true };

    const p = await Payment.findById(r.paymentId).session(session).lean();
    const to = p.amountRefunded + r.amount >= p.amount ? 'refunded' : 'partially_refunded';
    const t = await transition(p._id, to, {
      reason: `refund ${r._id}`,
      inc: { amountRefunded: r.amount, amountRefundPending: -r.amount },
      session,
      allowSame: true,
    });
    if (!t.changed) throw new Error(`Refund ${r._id} succeeded at provider but payment ${p._id} could not move: ${t.reason}`);

    await ledger.post({
      merchantId: r.merchantId,
      type: 'refund',
      ref: r._id,
      paymentId: p._id,
      idempotencyKey: `refund:${r._id}`,
      lines: postings.refund({ amount: r.amount }),
      session,
    });
    await outbox.enqueue({ merchantId: r.merchantId, type: 'refund.succeeded', objectId: r._id, data: serialize.refund(r), session });
    return { refundId: r._id, status: 'succeeded' };
  });
}

/** Called when all retries are exhausted. Releases the reserved amount. */
async function failRefund(refundId, errorMessage) {
  return withTransaction(async (session) => {
    const r = await Refund.findOneAndUpdate(
      { _id: refundId, status: 'pending' },
      { $set: { status: 'failed', failureReason: errorMessage } },
      { new: true, session },
    );
    if (!r) return { skipped: true };
    await Payment.updateOne({ _id: r.paymentId }, { $inc: { amountRefundPending: -r.amount } }, { session });
    await outbox.enqueue({ merchantId: r.merchantId, type: 'refund.failed', objectId: r._id, data: serialize.refund(r), session });
    logger.error({ refundId, error: errorMessage }, 'Refund failed after all retries');
    return { refundId, status: 'failed' };
  });
}

/** Flags refunds stuck in pending so an operator can look. Never re-sends money automatically. */
async function flagStuckRefunds() {
  const cutoff = new Date(Date.now() - 15 * 60000);
  const res = await Refund.updateMany({ status: 'pending', createdAt: { $lt: cutoff }, needsAttention: false }, { $set: { needsAttention: true } });
  return { flagged: res.modifiedCount };
}

async function listForPayment(merchantId, paymentId) {
  return Refund.find({ merchantId, paymentId }).sort({ createdAt: -1 }).lean();
}

module.exports = { createRefund, processRefund, failRefund, flagStuckRefunds, listForPayment };
