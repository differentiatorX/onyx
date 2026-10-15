// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const logger = require('../config/logger');
const { Payment, ProviderEvent } = require('../models');
const { unauthorized, badRequest } = require('../lib/errors');
const { getProvider } = require('../providers');
const { enqueue } = require('../queues');
const payments = require('./paymentService');

/**
 * Inbound webhook: verify, store once, acknowledge fast. Processing happens in a worker,
 * so a slow database never makes the provider time out and retry.
 */
async function ingest(providerName, rawBody, headers) {
  const provider = getProvider(providerName);
  if (!provider.verifyWebhook(rawBody, headers)) throw unauthorized('Webhook signature is invalid');

  let json;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw badRequest('Webhook body is not valid JSON');
  }
  const evt = provider.parseEvent(json, headers);
  if (!evt.eventId) throw badRequest('Webhook has no event id');

  try {
    const doc = await ProviderEvent.create({ provider: providerName, eventId: evt.eventId, type: evt.type, payload: json, normalized: evt });
    await enqueue('payments', 'provider-event', { providerEventId: doc._id }, { jobId: doc._id, attempts: 5, backoff: { type: 'exponential', delay: 2000 } });
    return { duplicate: false, id: doc._id };
  } catch (err) {
    if (err.code !== 11000) throw err;
    await ProviderEvent.updateOne({ provider: providerName, eventId: evt.eventId }, { $inc: { duplicateCount: 1 } });
    logger.info({ provider: providerName, eventId: evt.eventId }, 'Duplicate provider webhook ignored');
    return { duplicate: true };
  }
}

async function finish(id, status, note, paymentId) {
  await ProviderEvent.updateOne({ _id: id }, { $set: { status, note, ...(paymentId ? { paymentId } : {}) } });
  return { status, note };
}

async function processEvent(providerEventId) {
  const ev = await ProviderEvent.findById(providerEventId).lean();
  if (!ev || ev.status !== 'received') return { skipped: true };
  const n = ev.normalized || {};

  const payment = n.providerOrderId
    ? await Payment.findOne({ providerOrderId: n.providerOrderId }).lean()
    : await Payment.findOne({ providerPaymentId: n.providerPaymentId }).lean();
  if (!payment) return finish(ev._id, 'ignored', 'No Onyx payment matches this event');

  let result;
  switch (n.type) {
    case 'payment.authorized':
      result = await payments.markAuthorized(payment._id, { providerPaymentId: n.providerPaymentId, source: 'webhook' });
      break;
    case 'payment.captured':
      result = await payments.markCaptured(payment._id, { amount: n.amount, providerPaymentId: n.providerPaymentId, source: 'webhook' });
      break;
    case 'payment.failed':
      // A customer can fail once and retry on the same order. Only the attempt we track can fail the payment.
      if (payment.providerPaymentId !== n.providerPaymentId) {
        return finish(ev._id, 'ignored', 'Failed attempt is not the one being tracked; the customer may retry', payment._id);
      }
      result = await payments.markFailed(payment._id, { reason: n.errorReason || 'provider_declined', source: 'webhook' });
      break;
    default:
      return finish(ev._id, 'ignored', `Event type ${n.type} needs no action`, payment._id);
  }

  return result.changed
    ? finish(ev._id, 'processed', `Payment moved to ${result.payment.status}`, payment._id)
    : finish(ev._id, 'ignored', `No change: ${result.reason}`, payment._id);
}

async function markFailed(providerEventId, error) {
  await ProviderEvent.updateOne({ _id: providerEventId }, { $set: { status: 'failed', note: error } });
}

/** Re-enqueue events whose job was lost (stored, but the enqueue call failed). */
async function requeueOrphans() {
  const cutoff = new Date(Date.now() - 60000);
  const orphans = await ProviderEvent.find({ status: 'received', createdAt: { $lt: cutoff } }, { _id: 1 }).limit(100).lean();
  for (const { _id } of orphans) {
    await enqueue('payments', 'provider-event', { providerEventId: _id }, { jobId: `${_id}-requeue`, attempts: 5, backoff: { type: 'exponential', delay: 2000 } });
  }
  return { requeued: orphans.length };
}

module.exports = { ingest, processEvent, markFailed, requeueOrphans };
