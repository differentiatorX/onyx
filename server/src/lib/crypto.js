// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const crypto = require('crypto');

const sha256 = (input) => crypto.createHash('sha256').update(input).digest('hex');
const hmacHex = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** JSON with sorted keys, so semantically equal bodies hash the same. */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

function requestFingerprint(method, path, body) {
  return sha256(`${String(method).toUpperCase()} ${path}\n${canonicalJson(body ?? {})}`);
}

/** Stripe-style signature header: t=<unix seconds>,v1=<hex hmac of "t.body">. */
function signWebhook(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${hmacHex(secret, `${timestamp}.${body}`)}`;
}

function parseSignatureHeader(header) {
  const parts = {};
  for (const piece of String(header).split(',')) {
    const i = piece.indexOf('=');
    if (i > 0) parts[piece.slice(0, i).trim()] = piece.slice(i + 1).trim();
  }
  return parts;
}

function verifyWebhookSignature(header, body, secret, { toleranceSec = 300, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!header || !secret) return false;
  const parts = parseSignatureHeader(header);
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(now - t) > toleranceSec) return false;
  return safeEqual(parts.v1, hmacHex(secret, `${t}.${body}`));
}

module.exports = {
  sha256,
  hmacHex,
  safeEqual,
  canonicalJson,
  requestFingerprint,
  signWebhook,
  verifyWebhookSignature,
};
