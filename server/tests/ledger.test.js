// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { postings, validateLines, balanceDelta, LedgerError } = require('../src/domain/ledger');
const { computeFee } = require('../src/lib/money');

const sum = (lines, dir) => lines.filter((l) => l.direction === dir).reduce((a, l) => a + l.amount, 0);

describe('double-entry ledger', () => {
  test('capture posting balances and splits the fee', () => {
    const lines = postings.capture({ amount: 100000, fee: 2000 });
    expect(sum(lines, 'debit')).toBe(sum(lines, 'credit'));
    expect(lines).toContainEqual({ account: 'merchant_payable', direction: 'credit', amount: 98000 });
    expect(lines).toContainEqual({ account: 'fee_revenue', direction: 'credit', amount: 2000 });
    expect(() => validateLines(lines)).not.toThrow();
  });

  test('zero fee drops the empty line instead of posting 0', () => {
    const lines = postings.capture({ amount: 5000, fee: 0 });
    expect(lines).toHaveLength(2);
    expect(() => validateLines(lines)).not.toThrow();
  });

  test('every posting template balances', () => {
    for (const lines of [postings.refund({ amount: 700 }), postings.providerSettlement({ amount: 900 }), postings.payout({ amount: 880 })]) {
      expect(() => validateLines(lines)).not.toThrow();
    }
  });

  test('unbalanced entries are rejected', () => {
    expect(() => validateLines([{ account: 'provider_receivable', direction: 'debit', amount: 100 }, { account: 'merchant_payable', direction: 'credit', amount: 99 }])).toThrow(LedgerError);
  });

  test('floats, zero and unknown accounts are rejected', () => {
    expect(() => validateLines([{ account: 'provider_receivable', direction: 'debit', amount: 10.5 }, { account: 'merchant_payable', direction: 'credit', amount: 10.5 }])).toThrow(LedgerError);
    expect(() => validateLines([{ account: 'provider_receivable', direction: 'debit', amount: 0 }, { account: 'merchant_payable', direction: 'credit', amount: 0 }])).toThrow(LedgerError);
    expect(() => validateLines([{ account: 'cash', direction: 'debit', amount: 1 }, { account: 'merchant_payable', direction: 'credit', amount: 1 }])).toThrow(LedgerError);
  });

  test('fee larger than amount is rejected', () => {
    expect(() => postings.capture({ amount: 100, fee: 101 })).toThrow(LedgerError);
  });

  test('balance deltas follow normal sides', () => {
    expect(balanceDelta('asset', 'debit', 10)).toBe(10);
    expect(balanceDelta('asset', 'credit', 10)).toBe(-10);
    expect(balanceDelta('liability', 'credit', 10)).toBe(10);
    expect(balanceDelta('revenue', 'debit', 10)).toBe(-10);
  });

  test('full lifecycle leaves the books consistent: assets = liabilities + revenue', () => {
    const amount = 250000;
    const fee = computeFee(amount, 200);
    const entries = [postings.capture({ amount, fee }), postings.refund({ amount: 50000 }), postings.providerSettlement({ amount: 200000 }), postings.payout({ amount: 245000 - 50000 })];
    const types = { provider_receivable: 'asset', platform_cash: 'asset', merchant_payable: 'liability', fee_revenue: 'revenue' };
    const bal = { provider_receivable: 0, platform_cash: 0, merchant_payable: 0, fee_revenue: 0 };
    for (const lines of entries) for (const l of lines) bal[l.account] += balanceDelta(types[l.account], l.direction, l.amount);
    expect(bal.provider_receivable).toBe(0);
    expect(bal.merchant_payable).toBe(0);
    expect(bal.platform_cash).toBe(fee);
    expect(bal.provider_receivable + bal.platform_cash).toBe(bal.merchant_payable + bal.fee_revenue);
  });

  test('fee rounds half up in integer paise', () => {
    expect(computeFee(100000, 200)).toBe(2000);
    expect(computeFee(125, 200)).toBe(3); // 2.5 -> 3
    expect(computeFee(124, 200)).toBe(2); // 2.48 -> 2
  });
});
