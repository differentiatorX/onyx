// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { signWebhook, verifyWebhookSignature, canonicalJson, requestFingerprint } = require('../src/lib/crypto');
const { classifyExisting, isStorableStatus } = require('../src/domain/idempotency');

describe('webhook signatures', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ id: 'evt_1', type: 'payment.captured' });

  test('valid signature verifies', () => {
    expect(verifyWebhookSignature(signWebhook(secret, body), body, secret)).toBe(true);
  });

  test('tampered body fails', () => {
    expect(verifyWebhookSignature(signWebhook(secret, body), body.replace('captured', 'failed'), secret)).toBe(false);
  });

  test('wrong secret fails', () => {
    expect(verifyWebhookSignature(signWebhook(secret, body), body, 'other')).toBe(false);
  });

  test('replayed old signature fails outside the tolerance window', () => {
    const old = signWebhook(secret, body, Math.floor(Date.now() / 1000) - 3600);
    expect(verifyWebhookSignature(old, body, secret)).toBe(false);
  });

  test('garbage headers fail safely', () => {
    expect(verifyWebhookSignature('nonsense', body, secret)).toBe(false);
    expect(verifyWebhookSignature(undefined, body, secret)).toBe(false);
  });
});

describe('idempotency fingerprints', () => {
  test('key order does not change the fingerprint', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(requestFingerprint('post', '/v1/payments', { amount: 1, currency: 'INR' })).toBe(requestFingerprint('POST', '/v1/payments', { currency: 'INR', amount: 1 }));
  });

  test('different body or path changes the fingerprint', () => {
    expect(requestFingerprint('POST', '/v1/payments', { amount: 1 })).not.toBe(requestFingerprint('POST', '/v1/payments', { amount: 2 }));
    expect(requestFingerprint('POST', '/v1/payments', { amount: 1 })).not.toBe(requestFingerprint('POST', '/v1/refunds', { amount: 1 }));
  });

  test('classifies existing records', () => {
    const now = Date.now();
    expect(classifyExisting({ requestHash: 'x', state: 'completed' }, 'y')).toBe('payload_mismatch');
    expect(classifyExisting({ requestHash: 'x', state: 'completed' }, 'x')).toBe('replay');
    expect(classifyExisting({ requestHash: 'x', state: 'in_progress', lockedAt: new Date(now - 1000) }, 'x', { now })).toBe('in_progress');
    expect(classifyExisting({ requestHash: 'x', state: 'in_progress', lockedAt: new Date(now - 120000) }, 'x', { now })).toBe('stale_lock');
  });

  test('transient outcomes are not stored for replay', () => {
    expect(isStorableStatus(201)).toBe(true);
    expect(isStorableStatus(422)).toBe(true);
    expect(isStorableStatus(409)).toBe(false);
    expect(isStorableStatus(429)).toBe(false);
    expect(isStorableStatus(500)).toBe(false);
  });
});
