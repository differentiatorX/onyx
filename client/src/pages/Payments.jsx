// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { money, timeAgo } from '../format.js';
import { Empty, ErrorNote, StatusPill } from '../components/ui.jsx';
import CreatePaymentModal from '../components/CreatePaymentModal.jsx';

const FILTERS = [
  ['', 'All'],
  ['captured', 'Captured'],
  ['processing', 'Processing'],
  ['failed', 'Failed'],
  ['partially_refunded', 'Partly refunded'],
  ['refunded', 'Refunded'],
  ['blocked', 'Blocked'],
];

export default function Payments() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (after) => {
      setLoading(true);
      const params = new URLSearchParams({ limit: '25' });
      if (status) params.set('status', status);
      if (submittedQuery) params.set('q', submittedQuery);
      if (after) params.set('cursor', after);
      try {
        const res = await api.get(`/payments?${params}`);
        setRows((prev) => (after ? [...prev, ...res.data] : res.data));
        setCursor(res.next_cursor);
        setError(null);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [status, submittedQuery],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p className="lede">Search by payment id or customer email.</p>
        </div>
        <button className="btn" onClick={() => setCreating(true)}>Create test payment</button>
      </div>

      <div className="row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
        <div className="segments" role="group" aria-label="Filter by status">
          {FILTERS.map(([value, label]) => (
            <button key={value || 'all'} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>
          ))}
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); setSubmittedQuery(query.trim()); }}>
          <input className="input" style={{ width: 260 }} placeholder="pay_… or customer@email.com" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search payments" />
          <button className="btn ghost">Search</button>
        </form>
      </div>

      <ErrorNote error={error} />
      <section className="panel" style={{ padding: 0 }}>
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th className="amount">Amount</th><th>Status</th><th>Customer</th><th>Risk</th><th>Description</th><th>Created</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => nav(`/payments/${p.id}`)}>
                    <td className="amount">{money(p.amount)}</td>
                    <td><StatusPill status={p.status} /></td>
                    <td>{p.customer?.email}</td>
                    <td className="num">{p.risk ? <span className={p.risk.decision === 'allow' ? 'muted' : ''}>{p.risk.score}{p.risk.decision !== 'allow' ? `, ${p.risk.decision}` : ''}</span> : '—'}</td>
                    <td className="muted">{p.description || '—'}</td>
                    <td className="muted">{timeAgo(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty title="No payments match">Try another filter, or create a test payment.</Empty>
        )}
      </section>
      {cursor && (
        <div style={{ marginTop: 14 }}>
          <button className="btn ghost" disabled={loading} onClick={() => load(cursor)}>{loading ? 'Loading…' : 'Load more'}</button>
        </div>
      )}
      {creating && <CreatePaymentModal onClose={() => setCreating(false)} onCreated={() => load(null)} />}
    </>
  );
}
