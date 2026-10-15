// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const env = require('../config/env');

const iso = (d) => (d ? new Date(d).toISOString() : null);

function checkoutUrl(p) {
  if (p.status !== 'created') return null;
  return `${env.CLIENT_URL}/checkout/${p._id}?secret=${encodeURIComponent(p.clientSecret)}`;
}

function payment(p) {
  return {
    id: p._id,
    object: 'payment',
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    amount_refunded: p.amountRefunded || 0,
    amount_refund_pending: p.amountRefundPending || 0,
    fee: p.fee,
    net: p.fee == null ? null : p.amount - p.fee,
    description: p.description || null,
    customer: p.customer ? { email: p.customer.email || null, name: p.customer.name || null, contact: p.customer.contact || null } : null,
    metadata: p.metadata || {},
    risk: p.risk ? { score: p.risk.score, decision: p.risk.decision, reasons: (p.risk.reasons || []).map((r) => ({ code: r.code, points: r.points, message: r.message })) } : null,
    provider: p.provider,
    provider_order_id: p.providerOrderId || null,
    provider_payment_id: p.providerPaymentId || null,
    failure_reason: p.failureReason || null,
    checkout_url: checkoutUrl(p),
    settlement_id: p.settlementId || null,
    created_at: iso(p.createdAt),
    captured_at: iso(p.capturedAt),
    expires_at: iso(p.expiresAt),
    status_history: (p.statusHistory || []).map((h) => ({ status: h.status, at: iso(h.at), reason: h.reason || null })),
  };
}

const refund = (r) => ({
  id: r._id,
  object: 'refund',
  payment_id: r.paymentId,
  amount: r.amount,
  status: r.status,
  reason: r.reason || null,
  provider_refund_id: r.providerRefundId || null,
  attempts: r.attempts || 0,
  failure_reason: r.failureReason || null,
  needs_attention: !!r.needsAttention,
  created_at: iso(r.createdAt),
  succeeded_at: iso(r.succeededAt),
});

const journalEntry = (j) => ({
  id: j._id,
  type: j.type,
  ref: j.ref,
  payment_id: j.paymentId || null,
  lines: j.lines.map((l) => ({ account: l.account, direction: l.direction, amount: l.amount })),
  created_at: iso(j.createdAt),
});

const attempt = (a) => ({
  id: a._id,
  method: a.method,
  provider_ref: a.providerRef,
  outcome: a.outcome,
  error: a.error || null,
  created_at: iso(a.createdAt),
});

const providerEvent = (e) => ({
  id: e._id,
  provider: e.provider,
  event_id: e.eventId,
  type: e.type,
  status: e.status,
  note: e.note || null,
  duplicate_count: e.duplicateCount || 0,
  created_at: iso(e.createdAt),
});

const endpoint = (e, { revealSecret = false } = {}) => ({
  id: e._id,
  url: e.url,
  events: e.events,
  active: e.active,
  description: e.description || null,
  secret: revealSecret ? e.secret : `${e.secret.slice(0, 10)}…`,
  created_at: iso(e.createdAt),
});

const delivery = (d) => ({
  id: d._id,
  endpoint_id: d.endpointId,
  event_id: d.eventId,
  event_type: d.eventType,
  object_id: d.objectId,
  url: d.url,
  status: d.status,
  attempt_count: d.attemptCount || 0,
  attempts: (d.attempts || []).map((a) => ({ at: iso(a.at), attempt_number: a.attemptNumber, status_code: a.statusCode ?? null, error: a.error || null, duration_ms: a.durationMs })),
  last_error: d.lastError || null,
  delivered_at: iso(d.deliveredAt),
  created_at: iso(d.createdAt),
});

const settlement = (s) => ({
  id: s._id,
  payment_count: s.paymentCount,
  gross: s.gross,
  fees: s.fees,
  refunds: s.refunds,
  provider_settled: s.providerSettled,
  payout: s.payout,
  status: s.status,
  created_at: iso(s.createdAt),
});

const merchant = (m) => ({
  id: m._id,
  name: m.name,
  email: m.email,
  fee_bps: m.feeBps ?? env.PLATFORM_FEE_BPS,
  max_payment_amount: m.maxPaymentAmount,
  created_at: iso(m.createdAt),
});

const apiKey = (k) => ({
  id: k._id,
  display: k.displayPrefix,
  mode: k.mode,
  revoked: !!k.revokedAt,
  last_used_at: iso(k.lastUsedAt),
  created_at: iso(k.createdAt),
});

module.exports = { iso, payment, refund, journalEntry, attempt, providerEvent, endpoint, delivery, settlement, merchant, apiKey };
