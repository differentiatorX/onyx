// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const env = require('../config/env');
const logger = require('../config/logger');
const { OutboxEvent, WebhookEndpoint, WebhookDelivery } = require('../models');
const { signWebhook } = require('../lib/crypto');
const { newId, randomString } = require('../lib/ids');
const { badRequest, notFound } = require('../lib/errors');
const { enqueue } = require('../queues');

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?::1\]?$)/i;

/** Blocks SSRF to internal addresses unless dev routes are enabled. */
function assertDeliverableUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('Webhook URL is not a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Webhook URL must use http or https');
  if (!env.ENABLE_DEV_ROUTES) {
    if (url.protocol !== 'https:') throw badRequest('Webhook URL must use https');
    if (PRIVATE_HOST.test(url.hostname)) throw badRequest('Webhook URL cannot point at a private address');
  }
  return url.toString();
}

async function createEndpoint(merchantId, { url, events = ['*'], description }) {
  return WebhookEndpoint.create({ merchantId, url: assertDeliverableUrl(url), events, description, secret: `whsec_${randomString(32)}` });
}

async function deleteEndpoint(merchantId, endpointId) {
  const res = await WebhookEndpoint.deleteOne({ _id: endpointId, merchantId });
  if (!res.deletedCount) throw notFound('Webhook endpoint not found');
}

/**
 * Outbox relay. Fan-out is idempotent: the unique (eventId, endpointId) index stops
 * duplicate deliveries and jobId stops duplicate jobs, so a crash mid-relay is harmless.
 */
async function relayOutbox(limit = 100) {
  const events = await OutboxEvent.find({ published: false }).sort({ createdAt: 1 }).limit(limit).lean();
  for (const ev of events) {
    const endpoints = await WebhookEndpoint.find({ merchantId: ev.merchantId, active: true, $or: [{ events: '*' }, { events: ev.type }] }).lean();
    for (const ep of endpoints) {
      let delivery;
      try {
        delivery = await WebhookDelivery.create({ merchantId: ev.merchantId, endpointId: ep._id, eventId: ev._id, eventType: ev.type, objectId: ev.objectId, url: ep.url });
      } catch (err) {
        if (err.code !== 11000) throw err;
        delivery = await WebhookDelivery.findOne({ eventId: ev._id, endpointId: ep._id }).lean();
      }
      if (delivery.status === 'pending') {
        await enqueue('webhooks', 'deliver', { deliveryId: delivery._id }, { jobId: delivery._id, attempts: env.WEBHOOK_MAX_ATTEMPTS, backoff: { type: 'exponential', delay: 5000 } });
      }
    }
    await OutboxEvent.updateOne({ _id: ev._id }, { $set: { published: true, publishedAt: new Date() } });
  }
  return { relayed: events.length };
}

function buildPayload(ev) {
  return JSON.stringify({
    id: ev._id,
    object: 'event',
    type: ev.type,
    created: Math.floor(new Date(ev.createdAt).getTime() / 1000),
    data: { object: ev.data },
  });
}

/** One HTTP attempt. Throws on non-2xx so BullMQ schedules the next retry. */
async function deliver(deliveryId, { attemptNumber = 1 } = {}) {
  const d = await WebhookDelivery.findById(deliveryId).lean();
  if (!d || d.status === 'succeeded') return { skipped: true };
  const [ep, ev] = await Promise.all([WebhookEndpoint.findById(d.endpointId).lean(), OutboxEvent.findById(d.eventId).lean()]);
  if (!ep || !ep.active || !ev) {
    await WebhookDelivery.updateOne({ _id: deliveryId }, { $set: { status: 'failed', lastError: 'Endpoint removed or disabled' } });
    return { skipped: true };
  }

  const body = buildPayload(ev);
  const started = Date.now();
  let statusCode = null;
  let error = null;
  try {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Onyx-Webhooks/1.0',
        'onyx-event-id': ev._id,
        'onyx-signature': signWebhook(ep.secret, body),
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(env.WEBHOOK_TIMEOUT_MS),
    });
    statusCode = res.status;
    await res.arrayBuffer().catch(() => {});
    if (res.status < 200 || res.status >= 300) error = `Endpoint responded with ${res.status}`;
  } catch (err) {
    error = err.name === 'TimeoutError' ? `No response within ${env.WEBHOOK_TIMEOUT_MS} ms` : err.message;
  }

  const attempt = { at: new Date(), attemptNumber, statusCode, error, durationMs: Date.now() - started };
  await WebhookDelivery.updateOne(
    { _id: deliveryId },
    {
      $push: { attempts: { $each: [attempt], $slice: -20 } },
      $inc: { attemptCount: 1 },
      $set: { status: error ? 'retrying' : 'succeeded', lastError: error, lastAttemptAt: attempt.at, ...(error ? {} : { deliveredAt: attempt.at }) },
    },
  );
  if (error) throw new Error(error);
  return { delivered: true };
}

async function markDead(deliveryId, error) {
  await WebhookDelivery.updateOne({ _id: deliveryId, status: { $ne: 'succeeded' } }, { $set: { status: 'dead', lastError: error } });
  logger.warn({ deliveryId, error }, 'Webhook delivery moved to dead letter after final attempt');
}

async function replay(merchantId, deliveryId) {
  const d = await WebhookDelivery.findOneAndUpdate({ _id: deliveryId, merchantId }, { $set: { status: 'pending', lastError: null } }, { new: true }).lean();
  if (!d) throw notFound('Delivery not found');
  await enqueue('webhooks', 'deliver', { deliveryId: d._id }, { jobId: newId(`${d._id}-replay`, 6), attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
  return d;
}

module.exports = { assertDeliverableUrl, createEndpoint, deleteEndpoint, relayOutbox, deliver, markDead, replay, buildPayload };
