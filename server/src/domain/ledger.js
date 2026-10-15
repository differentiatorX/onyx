// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Double-entry chart of accounts, kept per merchant (a sub-ledger).
 *
 *   provider_receivable  asset      money the provider (Razorpay / mock bank) owes us for captures
 *   platform_cash        asset      money that has landed in the platform bank account
 *   merchant_payable     liability  money we owe the merchant, not yet paid out
 *   fee_revenue          revenue    our fees
 *
 * Invariant: every journal entry balances (sum of debits === sum of credits).
 */
class LedgerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LedgerError';
  }
}

const ACCOUNTS = Object.freeze({
  provider_receivable: { type: 'asset', name: 'Due from provider' },
  platform_cash: { type: 'asset', name: 'Platform bank' },
  merchant_payable: { type: 'liability', name: 'Owed to merchant' },
  fee_revenue: { type: 'revenue', name: 'Fee revenue' },
});

const DEBIT_NORMAL_TYPES = new Set(['asset', 'expense']);

/** Signed change to an account's balance, measured on its normal side. */
function balanceDelta(type, direction, amount) {
  const debitNormal = DEBIT_NORMAL_TYPES.has(type);
  const increases = debitNormal ? direction === 'debit' : direction === 'credit';
  return increases ? amount : -amount;
}

function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw new LedgerError('A journal entry needs at least two lines');
  let debits = 0;
  let credits = 0;
  for (const l of lines) {
    if (!ACCOUNTS[l.account]) throw new LedgerError(`Unknown account "${l.account}"`);
    if (l.direction !== 'debit' && l.direction !== 'credit') throw new LedgerError(`Invalid direction "${l.direction}"`);
    if (!Number.isSafeInteger(l.amount) || l.amount <= 0) throw new LedgerError(`Line amounts must be positive integers, got ${l.amount}`);
    if (l.direction === 'debit') debits += l.amount;
    else credits += l.amount;
  }
  if (debits !== credits) throw new LedgerError(`Unbalanced entry: debits ${debits} != credits ${credits}`);
  return { debits, credits };
}

const line = (account, direction, amount) => ({ account, direction, amount });
const nonZero = (lines) => lines.filter((l) => l.amount > 0);

const postings = Object.freeze({
  /** Customer paid. Provider owes us the gross; we owe the merchant gross minus fee. */
  capture: ({ amount, fee }) => {
    if (fee < 0 || fee > amount) throw new LedgerError(`Fee ${fee} must be between 0 and ${amount}`);
    return nonZero([
      line('provider_receivable', 'debit', amount),
      line('merchant_payable', 'credit', amount - fee),
      line('fee_revenue', 'credit', fee),
    ]);
  },
  /** Money goes back to the customer. Fees are not returned, matching Razorpay's policy. */
  refund: ({ amount }) => [line('merchant_payable', 'debit', amount), line('provider_receivable', 'credit', amount)],
  /** Provider settles what it owes into the platform bank account. */
  providerSettlement: ({ amount }) => [line('platform_cash', 'debit', amount), line('provider_receivable', 'credit', amount)],
  /** Platform pays the merchant. */
  payout: ({ amount }) => [line('merchant_payable', 'debit', amount), line('platform_cash', 'credit', amount)],
});

module.exports = { ACCOUNTS, LedgerError, balanceDelta, validateLines, postings };
