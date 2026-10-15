// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Background workers. Run as a separate process (npm run start:worker) so the API stays fast.
 *
 * payments     mock bank simulation, provider webhook processing, capture, expiry, stuck-payment polling
 * refunds      provider refund calls with exponential backoff
 * webhooks     outbound merchant webhook delivery with retries and a dead-letter state
 * maintenance  outbox relay, settlement, reconciliation
 */
if (require.main === module) process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'onyx-worker';
const { Worker } = require('bullmq');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDb, disconnectDb } = require('./config/db');
const { createRedis, closeRedis } = require('./config/redis');
const { QUEUES, getQueue, closeQueues } = require('./queues');
const { getProvider } = require('./providers');
const payments = require('./services/paymentService');
const providerEvents = require('./services/providerEventService');
const refunds = require('./services/refundService');
const webhooks = require('./services/webhookService');
const settlements = require('./services/settlementService');
const reconciliation = require('./services/reconciliationService');

const processors = {
  [QUEUES.payments]: async (job) => {
    switch (job.name) {
      case 'mockbank-process':
        return getProvider('mockbank').simulate(job.data);
      case 'provider-event':
        return providerEvents.processEvent(job.data.providerEventId);
      case 'capture':
        return payments.captureWithProvider(job.data.paymentId);
      case 'expire-stale':
        return payments.expireStale();
      case 'poll-stuck':
        return payments.pollStuck();
      case 'housekeeping':
        return { ...(await providerEvents.requeueOrphans()), ...(await refunds.flagStuckRefunds()) };
      default:
        throw new Error(`Unknown payments job ${job.name}`);
    }
  },
  [QUEUES.refunds]: async (job) => refunds.processRefund(job.data.refundId),
  [QUEUES.webhooks]: async (job) => webhooks.deliver(job.data.deliveryId, { attemptNumber: job.attemptsMade + 1 }),
  [QUEUES.maintenance]: async (job) => {
    switch (job.name) {
      case 'outbox-relay':
        return webhooks.relayOutbox();
      case 'settlement-run':
        return settlements.runAll();
      case 'reconciliation-run':
        return reconciliation.run({ trigger: 'schedule' });
      default:
        throw new Error(`Unknown maintenance job ${job.name}`);
    }
  },
};

/** What to do once a job has used up every retry. */
async function onExhausted(queue, job, err) {
  if (queue === QUEUES.webhooks) return webhooks.markDead(job.data.deliveryId, err.message);
  if (queue === QUEUES.refunds) return refunds.failRefund(job.data.refundId, err.message);
  if (queue === QUEUES.payments && job.name === 'provider-event') return providerEvents.markFailed(job.data.providerEventId, err.message);
  return null;
}

const SCHEDULES = [
  { queue: QUEUES.maintenance, name: 'outbox-relay', every: 1000 },
  { queue: QUEUES.maintenance, name: 'settlement-run', every: env.SETTLEMENT_INTERVAL_SECONDS * 1000 },
  { queue: QUEUES.maintenance, name: 'reconciliation-run', every: env.RECONCILIATION_INTERVAL_SECONDS * 1000 },
  { queue: QUEUES.payments, name: 'expire-stale', every: 60000 },
  { queue: QUEUES.payments, name: 'poll-stuck', every: 30000 },
  { queue: QUEUES.payments, name: 'housekeeping', every: 60000 },
];

async function schedule() {
  for (const s of SCHEDULES) {
    await getQueue(s.queue).upsertJobScheduler(s.name, { every: s.every }, { name: s.name, data: {}, opts: { removeOnComplete: true, removeOnFail: 100 } });
  }
}

/** Starts every worker and schedule. Assumes MongoDB is already connected. */
async function startWorkers() {
  const concurrency = { [QUEUES.payments]: 10, [QUEUES.refunds]: 5, [QUEUES.webhooks]: 20, [QUEUES.maintenance]: 1 };

  const workers = Object.entries(processors).map(([queue, processor]) => {
    const worker = new Worker(queue, processor, { connection: createRedis({ bull: true, name: `worker-${queue}` }), concurrency: concurrency[queue] });
    worker.on('failed', async (job, err) => {
      if (!job) return;
      const exhausted = job.attemptsMade >= (job.opts.attempts || 1);
      logger[exhausted ? 'error' : 'warn']({ queue, job: job.name, jobId: job.id, attempt: job.attemptsMade, err: err.message }, exhausted ? 'Job failed permanently' : 'Job failed; will retry');
      if (exhausted) await onExhausted(queue, job, err).catch((e) => logger.error({ err: e.message }, 'onExhausted handler failed'));
    });
    worker.on('error', (err) => logger.error({ queue, err: err.message }, 'Worker error'));
    return worker;
  });

  await schedule();
  logger.info({ queues: Object.keys(processors) }, 'Onyx workers running');
  return workers;
}

async function main() {
  await connectDb(env.MONGO_URI);
  const workers = await startWorkers();

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down workers');
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled([closeQueues(), closeRedis(), disconnectDb()]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { startWorkers };

if (require.main === module) {
  main().catch((err) => {
    logger.fatal({ err }, 'Worker failed to start');
    process.exit(1);
  });
}
