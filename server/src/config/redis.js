// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const IORedis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

/**
 * BullMQ needs maxRetriesPerRequest: null (blocking commands). App-level clients use a small
 * retry budget instead so a Redis outage fails fast and callers can fail open.
 */
function createRedis({ bull = false, name = 'redis' } = {}) {
  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: bull ? null : 1,
    enableReadyCheck: true,
  });
  client.on('error', (err) => logger.error({ err: err.message, client: name }, 'Redis error'));
  return client;
}

let shared;
function getRedis() {
  if (!shared) shared = createRedis({ name: 'app' });
  return shared;
}

async function closeRedis() {
  if (shared) await shared.quit().catch(() => {});
  shared = undefined;
}

module.exports = { createRedis, getRedis, closeRedis };
