// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDb, disconnectDb } = require('./config/db');
const { closeRedis } = require('./config/redis');
const { closeQueues } = require('./queues');
const { createApp } = require('./app');

async function main() {
  await connectDb(env.MONGO_URI);
  let workers = [];
  if (env.RUN_WORKERS_IN_API) {
    const { startWorkers } = require('./worker');
    workers = await startWorkers();
  }
  const server = createApp().listen(env.PORT, () => logger.info({ port: env.PORT, provider: env.PAYMENT_PROVIDER }, 'Onyx API listening'));

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down API');
    server.close(async () => {
      await Promise.allSettled(workers.map((w) => w.close()));
      await Promise.allSettled([closeQueues(), closeRedis(), disconnectDb()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'API failed to start');
  process.exit(1);
});
