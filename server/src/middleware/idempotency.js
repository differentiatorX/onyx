// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const env = require('../config/env');
const logger = require('../config/logger');
const asyncHandler = require('../lib/asyncHandler');
const { getRedis } = require('../config/redis');
const { IdempotencyRecord } = require('../models');
const { requestFingerprint, sha256 } = require('../lib/crypto');
const { AppError, badRequest, conflict, unprocessable } = require('../lib/errors');
const { classifyExisting, isStorableStatus } = require('../domain/idempotency');

/**
 * Idempotency-Key support for POST requests (Stripe semantics).
 *  - Same key + same body  -> the original response is replayed (Idempotent-Replayed: true)
 *  - Same key + other body -> 422
 *  - Same key, first call still running -> 409, retry later
 * The record is claimed with a unique index before the handler runs, so two concurrent
 * retries can never both execute. The response is stored before it is sent.
 */
module.exports = function idempotency() {
  const ttlSeconds = env.IDEMPOTENCY_TTL_HOURS * 3600;

  return asyncHandler(async (req, res, next) => {
    if (req.method !== 'POST') return next();
    const key = req.get('idempotency-key');
    if (!key) return next();
    if (key.length > 255) throw badRequest('Idempotency-Key must be at most 255 characters');

    const merchantId = req.merchant._id;
    const fingerprint = requestFingerprint(req.method, req.baseUrl + req.path, req.body);
    const cacheKey = `idem:${merchantId}:${sha256(key)}`;
    const redis = getRedis();

    const replay = (status, body) => {
      res.set('Idempotent-Replayed', 'true');
      return res.status(status).json(body);
    };

    // Fast path: completed responses are cached in Redis.
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const c = JSON.parse(cached);
        if (c.fingerprint !== fingerprint) throw unprocessable('This Idempotency-Key was already used with a different request', 'idempotency_key_reused');
        return replay(c.status, c.body);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.warn({ err: err.message }, 'Idempotency cache unavailable; falling back to MongoDB');
    }

    let record;
    try {
      record = await IdempotencyRecord.create({
        merchantId,
        key,
        requestHash: fingerprint,
        method: req.method,
        path: req.baseUrl + req.path,
        state: 'in_progress',
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      const existing = await IdempotencyRecord.findOne({ merchantId, key }).lean();
      if (!existing) throw conflict('A request with this Idempotency-Key is in progress', 'idempotency_in_progress');
      const verdict = classifyExisting(existing, fingerprint);
      if (verdict === 'payload_mismatch') throw unprocessable('This Idempotency-Key was already used with a different request', 'idempotency_key_reused');
      if (verdict === 'replay') return replay(existing.responseStatus, existing.responseBody);
      if (verdict === 'in_progress') throw conflict('A request with this Idempotency-Key is still being processed', 'idempotency_in_progress');
      record = await IdempotencyRecord.findOneAndUpdate(
        { _id: existing._id, state: 'in_progress', lockedAt: existing.lockedAt },
        { $set: { lockedAt: new Date() } },
        { new: true },
      );
      if (!record) throw conflict('A request with this Idempotency-Key is still being processed', 'idempotency_in_progress');
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode;
      const persist = isStorableStatus(status)
        ? IdempotencyRecord.updateOne({ _id: record._id }, { $set: { state: 'completed', responseStatus: status, responseBody: body } }).then(() =>
            redis.set(cacheKey, JSON.stringify({ fingerprint, status, body }), 'EX', ttlSeconds).catch(() => {}),
          )
        : IdempotencyRecord.deleteOne({ _id: record._id });
      persist
        .catch((err) => logger.error({ err: err.message }, 'Could not persist idempotency record'))
        .finally(() => originalJson(body));
      return res;
    };
    return next();
  });
};
