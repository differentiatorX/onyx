// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const mongoose = require('mongoose');
const logger = require('./logger');

async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { autoIndex: true, serverSelectionTimeoutMS: 15000 });
  logger.info('MongoDB connected');
}

/**
 * Runs fn inside a MongoDB transaction. The driver retries the whole callback on
 * transient errors (write conflicts), so fn must not have side effects outside the session.
 */
async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result;
  } finally {
    await session.endSession();
  }
}

async function disconnectDb() {
  await mongoose.disconnect();
}

module.exports = { connectDb, withTransaction, disconnectDb };
