// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { canTransition, isTerminal, allowedFrom } = require('../src/domain/paymentStateMachine');

describe('payment state machine', () => {
  test('happy path is allowed', () => {
    expect(canTransition('created', 'processing')).toBe(true);
    expect(canTransition('processing', 'authorized')).toBe(true);
    expect(canTransition('authorized', 'captured')).toBe(true);
    expect(canTransition('captured', 'partially_refunded')).toBe(true);
    expect(canTransition('partially_refunded', 'refunded')).toBe(true);
  });

  test('out-of-order webhook cannot move a payment backwards', () => {
    expect(canTransition('captured', 'authorized')).toBe(false);
    expect(canTransition('captured', 'processing')).toBe(false);
    expect(canTransition('refunded', 'captured')).toBe(false);
  });

  test('a late failure cannot undo a capture', () => {
    expect(canTransition('captured', 'failed')).toBe(false);
  });

  test('terminal states have no exits', () => {
    for (const s of ['failed', 'expired', 'refunded', 'blocked']) expect(isTerminal(s)).toBe(true);
    expect(isTerminal('captured')).toBe(false);
  });

  test('provider can report a capture before the checkout callback', () => {
    expect(canTransition('created', 'captured')).toBe(true);
  });

  test('allowedFrom lists predecessor states', () => {
    expect(allowedFrom('refunded').sort()).toEqual(['captured', 'partially_refunded']);
  });
});
