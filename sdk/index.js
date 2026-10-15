// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Onyx Node SDK. Zero dependencies.
 *
 *   const Onyx = require('@onyx/node');
 *   const onyx = new Onyx(process.env.ONYX_SECRET_KEY);
 *   const payment = await onyx.payments.create({ amount: 49900, customer: { email } }, { idempotencyKey: orderId });
 */
const crypto = require('crypto');

class OnyxError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'OnyxError';
    this.status = status;
    this.code = code;
  }
}

const RETRYABLE = new Set([409, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Onyx {
  constructor(secretKey, { baseUrl = 'http://localhost:4000', maxRetries = 3, timeoutMs = 15000 } = {}) {
    if (!secretKey || !secretKey.startsWith('sk_')) throw new Error('Onyx: pass your secret key (sk_test_...)');
    this.secretKey = secretKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;

    this.payments = {
      create: (params, opts) => this.request('POST', '/v1/payments', params, opts),
      retrieve: (id) => this.request('GET', `/v1/payments/${encodeURIComponent(id)}`),
      list: (query = {}) => this.request('GET', `/v1/payments?${new URLSearchParams(query)}`),
    };
    this.refunds = {
      create: (paymentId, params = {}, opts) => this.request('POST', `/v1/payments/${encodeURIComponent(paymentId)}/refunds`, params, opts),
      retrieve: (id) => this.request('GET', `/v1/refunds/${encodeURIComponent(id)}`),
    };
    this.balance = { retrieve: () => this.request('GET', '/v1/balance') };
  }

  /**
   * POSTs always carry an Idempotency-Key (generated if you do not pass one), so the
   * automatic retries below can never create a second payment or refund.
   */
  async request(method, path, body, { idempotencyKey } = {}) {
    const headers = { authorization: `Bearer ${this.secretKey}`, 'content-type': 'application/json', 'user-agent': 'onyx-node/0.1.0 (github.com/differentiatorX)' };
    if (method === 'POST') headers['idempotency-key'] = idempotencyKey || crypto.randomUUID();

    for (let attempt = 0; ; attempt += 1) {
      let res;
      try {
        res = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (err) {
        if (attempt < this.maxRetries) {
          await sleep(2 ** attempt * 300);
          continue;
        }
        throw new OnyxError(`Network error: ${err.message}`, 0, 'network_error');
      }
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json;
      if (RETRYABLE.has(res.status) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(retryAfter ? retryAfter * 1000 : 2 ** attempt * 300);
        continue;
      }
      throw new OnyxError(json?.error?.message || `HTTP ${res.status}`, res.status, json?.error?.code);
    }
  }

  /** Verify a webhook. Pass the raw body string exactly as received. */
  static verifyWebhook(rawBody, signatureHeader, secret, toleranceSec = 300) {
    if (!signatureHeader) return false;
    const parts = Object.fromEntries(String(signatureHeader).split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));
    const t = Number(parts.t);
    if (!Number.isFinite(t) || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(parts.v1);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}

module.exports = Onyx;
module.exports.OnyxError = OnyxError;
