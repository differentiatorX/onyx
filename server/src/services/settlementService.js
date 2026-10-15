// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const env = require('../config/env');
const logger = require('../config/logger');
const { withTransaction } = require('../config/db');
const { Merchant, Payment, Settlement } = require('../models');
const { CAPTURED_STATES } = require('../domain/paymentStateMachine');
const { postings } = require('../domain/ledger');
const { newId } = require('../lib/ids');
const serialize = require('../lib/serialize');
const ledger = require('./ledgerService');
const outbox = require('./outboxService');

/**
 * Balance-sweep model. A run happens once at least one captured payment is older than
 * SETTLEMENT_DELAY_MINUTES. The provider then settles everything it owes, and the merchant
 * is paid its full payable balance. Amounts come straight from ledger balances, so the
 * ledger stays consistent even when a refund lands after its payment was settled
 * (the payable simply goes negative and is netted off the next payout).
 */
async function settleMerchant(merchantId) {
  const cutoff = new Date(Date.now() - env.SETTLEMENT_DELAY_MINUTES * 60000);
  return withTransaction(async (session) => {
    const balances = await ledger.getBalances(merchantId, session);
    const providerDue = balances.provider_receivable;
    const payable = balances.merchant_payable;
    if (providerDue <= 0 && payable <= 0) return null;

    const included = await Payment.find({ merchantId, settlementId: null, status: { $in: CAPTURED_STATES }, capturedAt: { $lte: cutoff } })
      .session(session)
      .lean();
    if (!included.length) return null;

    const settlementId = newId('stl');
    if (providerDue > 0) {
      await ledger.post({ merchantId, type: 'provider_settlement', ref: settlementId, idempotencyKey: `settlement:${settlementId}:provider`, lines: postings.providerSettlement({ amount: providerDue }), session });
    }
    if (payable > 0) {
      await ledger.post({ merchantId, type: 'payout', ref: settlementId, idempotencyKey: `settlement:${settlementId}:payout`, lines: postings.payout({ amount: payable }), session });
    }
    const ids = included.map((p) => p._id);
    await Payment.updateMany({ _id: { $in: ids } }, { $set: { settlementId } }, { session });

    const [s] = await Settlement.create(
      [
        {
          _id: settlementId,
          merchantId,
          paymentIds: ids,
          paymentCount: ids.length,
          gross: included.reduce((a, p) => a + p.amount, 0),
          fees: included.reduce((a, p) => a + (p.fee || 0), 0),
          refunds: included.reduce((a, p) => a + (p.amountRefunded || 0), 0),
          providerSettled: Math.max(providerDue, 0),
          payout: Math.max(payable, 0),
        },
      ],
      { session },
    );
    await outbox.enqueue({ merchantId, type: 'settlement.paid', objectId: s._id, data: serialize.settlement(s), session });
    return s;
  });
}

async function runAll() {
  const merchants = await Merchant.find({}, { _id: 1 }).lean();
  const created = [];
  for (const { _id } of merchants) {
    try {
      const s = await settleMerchant(_id);
      if (s) created.push(s._id);
    } catch (err) {
      logger.error({ err: err.message, merchantId: _id }, 'Settlement failed for merchant');
    }
  }
  return { settlements: created.length };
}

module.exports = { settleMerchant, runAll };
