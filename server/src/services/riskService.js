// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { getRedis } = require('../config/redis');
const logger = require('../config/logger');
const { evaluateRisk, DEFAULT_RISK_CONFIG } = require('../domain/fraud');

const keys = (merchantId, email) => ({
  velocity: `risk:vel:${merchantId}:${email}`,
  failures: `risk:fail:${merchantId}:${email}`,
  seen: `risk:seen:${merchantId}:${email}`,
});

/** Reads velocity counters from Redis. If Redis is down, scores without them (fail open). */
async function assess({ merchant, amount, email }) {
  const e = String(email || '').toLowerCase();
  let recentPayments = 0;
  let recentFailures = 0;
  let seen = false;
  try {
    const k = keys(merchant._id, e);
    const [[, v], [, f], [, s]] = await getRedis().multi().get(k.velocity).get(k.failures).exists(k.seen).exec();
    recentPayments = Number(v || 0);
    recentFailures = Number(f || 0);
    seen = s === 1;
  } catch (err) {
    logger.warn({ err: err.message }, 'Risk counters unavailable; scoring without velocity data');
  }
  return evaluateRisk({
    amount,
    maxAmount: merchant.maxPaymentAmount,
    email: e,
    recentPaymentsByEmail: recentPayments,
    recentFailuresByEmail: recentFailures,
    isFirstTimeCustomer: !seen,
  });
}

async function recordPayment(merchantId, email) {
  try {
    const k = keys(merchantId, String(email).toLowerCase());
    await getRedis()
      .multi()
      .incr(k.velocity)
      .expire(k.velocity, DEFAULT_RISK_CONFIG.velocityWindowMinutes * 60, 'NX')
      .set(k.seen, '1', 'EX', 90 * 24 * 3600)
      .exec();
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not record risk velocity');
  }
}

async function recordFailure(merchantId, email) {
  if (!email) return;
  try {
    const k = keys(merchantId, String(email).toLowerCase());
    await getRedis().multi().incr(k.failures).expire(k.failures, DEFAULT_RISK_CONFIG.failureWindowMinutes * 60, 'NX').exec();
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not record risk failure');
  }
}

module.exports = { assess, recordPayment, recordFailure };
