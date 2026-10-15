// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { Payment, Settlement } = require('../models');
const { CAPTURED_STATES } = require('../domain/paymentStateMachine');
const ledger = require('./ledgerService');

const TZ = 'Asia/Kolkata';
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });

async function overview(merchantId, days = 14) {
  const since = new Date(Date.now() - days * 86400000);
  const [series, statusRows, balances, paidOut] = await Promise.all([
    Payment.aggregate([
      { $match: { merchantId, capturedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$capturedAt', timezone: TZ } }, volume: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([{ $match: { merchantId, createdAt: { $gte: since } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ledger.getBalances(merchantId),
    Settlement.aggregate([{ $match: { merchantId } }, { $group: { _id: null, total: { $sum: '$payout' } } }]),
  ]);

  const byDay = new Map(series.map((s) => [s._id, s]));
  const volume = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(Date.now() - i * 86400000);
    const row = byDay.get(key);
    volume.push({ date: key, volume: row?.volume || 0, count: row?.count || 0 });
  }

  const statusCounts = Object.fromEntries(statusRows.map((r) => [r._id, r.count]));
  const succeeded = CAPTURED_STATES.reduce((a, s) => a + (statusCounts[s] || 0), 0);
  const failed = statusCounts.failed || 0;

  return {
    window_days: days,
    volume,
    status_counts: statusCounts,
    success_rate: succeeded + failed ? succeeded / (succeeded + failed) : null,
    captured_volume: volume.reduce((a, d) => a + d.volume, 0),
    balances: {
      unsettled: balances.merchant_payable,
      fees_paid: balances.fee_revenue,
      paid_out: paidOut[0]?.total || 0,
    },
  };
}

module.exports = { overview };
