// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useResource } from '../hooks.js';
import { dateTime, money, statusTone, toPaise, EVENT_LABELS, timeAgo } from '../format.js';
import { CopyText, ErrorNote, StatusPill } from '../components/ui.jsx';
import LedgerTAccount from '../components/LedgerTAccount.jsx';

const LIVE = new Set(['created', 'processing', 'authorized']);
const REFUND_LABELS = { pending: 'In progress', succeeded: 'Refunded', failed: 'Failed' };
const RISK_COLOR = { allow: 'var(--credit)', review: 'var(--wait)', block: 'var(--debit)' };

const REASON_TEXT = {
  customer_confirmed: 'Customer confirmed at checkout',
  captured_via_webhook: 'Bank confirmed by webhook',
  captured_via_status_poll: 'Bank never called back; recovered by polling the bank',
  captured_via_capture_api: 'Captured through the provider API',
  authorized_via_webhook: 'Bank authorized the payment',
  failed_via_webhook: 'Bank declined the payment',
  failed_via_status_poll: 'Bank declined; found by polling',
  checkout_window_elapsed: 'Customer did not pay in time',
  flagged_for_review: 'Risk rules flagged this for review',
};
const explain = (reason) => (reason ? REASON_TEXT[reason] || reason.replace(/_/g, ' ') : null);

export default function PaymentDetail() {
  const { id } = useParams();
  const { data, error, reload } = useResource(`/payments/${id}`, {
    pollMs: 2000,
    shouldPoll: (d) => !d || LIVE.has(d.payment.status) || d.refunds.some((r) => r.status === 'pending') || d.deliveries.some((x) => ['pending', 'retrying'].includes(x.status)),
  });

  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading payment…</p>;
  const p = data.payment;

  return (
    <>
      <Link to="/payments" className="back">Payments</Link>
      <div className="hero">
        <span className="hero-amount">{money(p.amount)}</span>
        <StatusPill status={p.status} />
      </div>
      <div className="row muted small" style={{ marginBottom: 24 }}>
        <span className="code">{p.id}</span>
        <CopyText value={p.id} label="Copy id" />
        {p.description && <span>{p.description}</span>}
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <h2>What happened</h2>
            <ol className="timeline">
              {p.status_history.map((h, i) => (
                <li key={i} className={statusTone(h.status)}>
                  <div><StatusPill status={h.status} /> <span className="when">{dateTime(h.at)}</span></div>
                  {explain(h.reason) && <div className="why">{explain(h.reason)}</div>}
                </li>
              ))}
            </ol>
            {p.failure_reason && <div className="notice bad">Reason: {p.failure_reason.replace(/_/g, ' ')}</div>}
          </section>

          <RefundPanel payment={p} refunds={data.refunds} onChange={reload} />

          <section className="panel">
            <div className="panel-head">
              <h2>Messages from the bank</h2>
              <span className="muted small">Duplicates and late arrivals are absorbed here</span>
            </div>
            {data.provider_events.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Event</th><th>Outcome</th><th>Copies received</th><th>Note</th></tr></thead>
                  <tbody>
                    {data.provider_events.map((e) => (
                      <tr key={e.id}>
                        <td>{e.type}<div className="muted small">{timeAgo(e.created_at)}</div></td>
                        <td><StatusPill status={e.status} /></td>
                        <td className="num">{1 + e.duplicate_count}</td>
                        <td className="muted small">{e.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">No bank messages yet.</p>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <h2>Details</h2>
            <dl className="facts">
              <dt>Customer</dt><dd>{p.customer?.email}</dd>
              <dt>Fee</dt><dd className="num">{money(p.fee)}</dd>
              <dt>Net to you</dt><dd className="num">{money(p.net)}</dd>
              <dt>Refunded</dt><dd className="num">{money(p.amount_refunded)}{p.amount_refund_pending ? `, ${money(p.amount_refund_pending)} in progress` : ''}</dd>
              <dt>Provider</dt><dd>{p.provider}</dd>
              <dt>Provider order</dt><dd className="code">{p.provider_order_id || '—'}</dd>
              <dt>Provider payment</dt><dd className="code">{p.provider_payment_id || '—'}</dd>
              <dt>Settlement</dt><dd className="code">{p.settlement_id || 'Not yet settled'}</dd>
              <dt>Created</dt><dd>{dateTime(p.created_at)}</dd>
              {p.checkout_url && (<><dt>Checkout</dt><dd><a href={p.checkout_url} target="_blank" rel="noreferrer">Open checkout page</a></dd></>)}
            </dl>
          </section>

          {p.risk && (
            <section className="panel">
              <div className="panel-head">
                <h2>Risk</h2>
                <span className="num" style={{ color: RISK_COLOR[p.risk.decision], fontWeight: 600 }}>{p.risk.score} of 100, {p.risk.decision}</span>
              </div>
              <div className="meter"><span style={{ width: `${p.risk.score}%`, background: RISK_COLOR[p.risk.decision] }} /></div>
              {p.risk.reasons.length ? (
                <ul className="reasons">{p.risk.reasons.map((r) => <li key={r.code}>{r.message} <span className="muted">(+{r.points})</span></li>)}</ul>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>No rules fired.</p>
              )}
            </section>
          )}

          <section className="panel">
            <h2>Ledger</h2>
            <LedgerTAccount entries={data.journal} />
          </section>

          <section className="panel">
            <h2>Webhooks sent to you</h2>
            {data.deliveries.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Event</th><th>Status</th><th>Tries</th></tr></thead>
                  <tbody>
                    {data.deliveries.map((d) => (
                      <tr key={d.id}>
                        <td>{EVENT_LABELS[d.event_type] || d.event_type}{d.last_error && <div className="muted small">{d.last_error}</div>}</td>
                        <td><StatusPill status={d.status} /></td>
                        <td className="num">{d.attempt_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">Nothing sent yet. Webhooks go out once the payment changes state.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function RefundPanel({ payment, refunds, onChange }) {
  const refundable = payment.amount - payment.amount_refunded - payment.amount_refund_pending;
  const canRefund = ['captured', 'partially_refunded'].includes(payment.status) && refundable > 0;
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/payments/${payment.id}/refunds`, amount ? { amount: toPaise(amount), reason: 'Refund from dashboard' } : { reason: 'Refund from dashboard' });
      setAmount('');
      onChange();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!canRefund && !refunds.length) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Refunds</h2>
        {canRefund && <span className="muted small num">{money(refundable)} can be refunded</span>}
      </div>
      {canRefund && (
        <form className="row" onSubmit={submit} style={{ marginBottom: refunds.length ? 14 : 0 }}>
          <input className="input num" style={{ width: 160 }} inputMode="decimal" placeholder={`Full: ${(refundable / 100).toFixed(2)}`} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Refund amount in rupees" />
          <button className="btn" disabled={busy}>{busy ? 'Refunding…' : amount ? 'Refund this amount' : 'Refund in full'}</button>
        </form>
      )}
      <ErrorNote error={error} />
      {refunds.length > 0 && (
        <table>
          <thead><tr><th className="amount">Amount</th><th>Status</th><th>Tries</th><th>Created</th></tr></thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id}>
                <td className="amount">{money(r.amount)}</td>
                <td><StatusPill status={r.status} label={REFUND_LABELS[r.status]} />{r.failure_reason && <div className="muted small">{r.failure_reason}</div>}</td>
                <td className="num">{r.attempts}</td>
                <td className="muted">{timeAgo(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
