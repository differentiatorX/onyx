// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { evaluateRisk } = require('../src/domain/fraud');

const base = { amount: 50000, maxAmount: 50000000, email: 'a@example.com', recentPaymentsByEmail: 0, recentFailuresByEmail: 0, isFirstTimeCustomer: false };

describe('risk rules', () => {
  test('ordinary payment is allowed', () => {
    expect(evaluateRisk(base).decision).toBe('allow');
  });

  test('amount above merchant limit is blocked', () => {
    const r = evaluateRisk({ ...base, amount: 60000000 });
    expect(r.decision).toBe('block');
    expect(r.reasons.map((x) => x.code)).toContain('amount_over_limit');
  });

  test('repeated failures block the customer', () => {
    expect(evaluateRisk({ ...base, recentFailuresByEmail: 3 }).decision).toBe('block');
  });

  test('high velocity is sent for review', () => {
    expect(evaluateRisk({ ...base, recentPaymentsByEmail: 5 }).decision).toBe('review');
  });

  test('disposable email alone is allowed, combined with a large first payment it is reviewed', () => {
    expect(evaluateRisk({ ...base, email: 'x@mailinator.com' }).decision).toBe('allow');
    expect(evaluateRisk({ ...base, email: 'x@mailinator.com', isFirstTimeCustomer: true, amount: 3000000 }).decision).toBe('review');
  });

  test('score is capped at 100', () => {
    expect(evaluateRisk({ ...base, amount: 60000000, recentFailuresByEmail: 9, recentPaymentsByEmail: 9 }).score).toBe(100);
  });
});
