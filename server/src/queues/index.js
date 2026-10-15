// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Queue } = require('bullmq');
const { createRedis } = require('../config/redis');

const QUEUES = Object.freeze({
  payments: 'payments',
  refunds: 'refunds',
  webhooks: 'webhooks',
  maintenance: 'maintenance',
});

let connection;
const queues = new Map();

function getConnection() {
  if (!connection) connection = createRedis({ bull: true, name: 'bull-producer' });
  return connection;
}

function getQueue(name) {
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: getConnection(),
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600, count: 5000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      }),
    );
  }
  return queues.get(name);
}

/** jobId makes enqueueing idempotent: BullMQ ignores a second add with the same id. */
const enqueue = (queue, name, data, opts = {}) => getQueue(queue).add(name, data, opts);

async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => {})));
  queues.clear();
  if (connection) await connection.quit().catch(() => {});
  connection = undefined;
}

module.exports = { QUEUES, getQueue, enqueue, closeQueues };
