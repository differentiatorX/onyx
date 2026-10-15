// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { JournalEntry, LedgerAccount } = require('../models');
const { ACCOUNTS, validateLines, balanceDelta } = require('../domain/ledger');

const accountId = (merchantId, code) => `${merchantId}:${code}`;

async function ensureAccounts(merchantId, session) {
  const ops = Object.entries(ACCOUNTS).map(([code, def]) => ({
    updateOne: {
      filter: { _id: accountId(merchantId, code) },
      update: { $setOnInsert: { merchantId, code, type: def.type, name: def.name, currency: 'INR', balance: 0 } },
      upsert: true,
    },
  }));
  await LedgerAccount.bulkWrite(ops, session ? { session } : {});
}

/**
 * Posts a balanced journal entry and updates account balances in the same transaction.
 * The unique idempotencyKey makes posting exactly-once: a retried capture can never
 * be booked twice.
 */
async function post({ merchantId, type, ref, paymentId, idempotencyKey, lines, session }) {
  if (!session) throw new Error('ledger.post must run inside a transaction');
  validateLines(lines);

  const existing = await JournalEntry.findOne({ idempotencyKey }).session(session);
  if (existing) return { entry: existing, duplicate: true };

  const [entry] = await JournalEntry.create([{ merchantId, type, ref, paymentId, idempotencyKey, lines }], { session });
  for (const l of lines) {
    const def = ACCOUNTS[l.account];
    await LedgerAccount.updateOne(
      { _id: accountId(merchantId, l.account) },
      {
        $inc: { balance: balanceDelta(def.type, l.direction, l.amount) },
        $setOnInsert: { merchantId, code: l.account, type: def.type, name: def.name, currency: 'INR' },
      },
      { upsert: true, session },
    );
  }
  return { entry, duplicate: false };
}

async function getBalances(merchantId, session) {
  const query = LedgerAccount.find({ merchantId }).lean();
  if (session) query.session(session);
  const rows = await query;
  const balances = Object.fromEntries(Object.keys(ACCOUNTS).map((code) => [code, 0]));
  for (const r of rows) balances[r.code] = r.balance;
  return balances;
}

async function listAccounts(merchantId) {
  const balances = await getBalances(merchantId);
  return Object.entries(ACCOUNTS).map(([code, def]) => ({
    code,
    name: def.name,
    type: def.type,
    normal_side: ['asset', 'expense'].includes(def.type) ? 'debit' : 'credit',
    balance: balances[code],
  }));
}

/**
 * Recomputes every balance from the journal and compares it with the stored balance.
 * Also checks that total debits equal total credits. Any drift means a bug.
 */
async function verifyIntegrity(merchantId) {
  const rows = await JournalEntry.aggregate([
    { $match: { merchantId } },
    { $unwind: '$lines' },
    { $group: { _id: { account: '$lines.account', direction: '$lines.direction' }, total: { $sum: '$lines.amount' } } },
  ]);
  let totalDebits = 0;
  let totalCredits = 0;
  const expected = Object.fromEntries(Object.keys(ACCOUNTS).map((c) => [c, 0]));
  for (const r of rows) {
    const { account, direction } = r._id;
    if (direction === 'debit') totalDebits += r.total;
    else totalCredits += r.total;
    if (ACCOUNTS[account]) expected[account] += balanceDelta(ACCOUNTS[account].type, direction, r.total);
  }
  const stored = await getBalances(merchantId);
  const accounts = Object.keys(ACCOUNTS).map((code) => ({ code, stored: stored[code], expected: expected[code], drift: stored[code] - expected[code] }));
  const driftAccounts = accounts.filter((a) => a.drift !== 0).map((a) => a.code);
  return { balanced: totalDebits === totalCredits && driftAccounts.length === 0, totalDebits, totalCredits, accounts, driftAccounts };
}

module.exports = { accountId, ensureAccounts, post, getBalances, listAccounts, verifyIntegrity };
