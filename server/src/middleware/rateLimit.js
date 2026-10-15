// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const env = require('../config/env');
const logger = require('../config/logger');
const { getRedis } = require('../config/redis');
const { tooManyRequests } = require('../lib/errors');

/**
 * Token bucket in one atomic Lua script, so concurrent requests across many API
 * instances share one accurate bucket. Uses Redis server time to avoid clock skew.
 */
const TOKEN_BUCKET = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
tokens = math.min(capacity, tokens + (math.max(0, now - ts) / 1000) * refill)
local allowed = 0
if tokens >= cost then tokens = tokens - cost; allowed = 1 end
redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil(capacity / refill * 1000) + 1000)
return { allowed, tostring(tokens) }
`;

function rateLimit({ capacity = env.RATE_LIMIT_CAPACITY, refillPerSec = env.RATE_LIMIT_REFILL_PER_SEC, keyFn, prefix = 'api' } = {}) {
  return async (req, res, next) => {
    const id = keyFn ? keyFn(req) : req.apiKeyId || req.ip;
    try {
      const [allowed, remaining] = await getRedis().eval(TOKEN_BUCKET, 1, `rl:${prefix}:${id}`, capacity, refillPerSec, 1);
      res.set('RateLimit-Limit', String(capacity));
      res.set('RateLimit-Remaining', String(Math.floor(Number(remaining))));
      if (allowed !== 1) {
        res.set('Retry-After', String(Math.ceil(1 / refillPerSec)));
        return next(tooManyRequests('Too many requests; slow down and retry after the Retry-After interval'));
      }
    } catch (err) {
      // Fail open: a Redis outage should not take payments down.
      logger.warn({ err: err.message }, 'Rate limiter unavailable; allowing request');
    }
    return next();
  };
}

module.exports = rateLimit;
