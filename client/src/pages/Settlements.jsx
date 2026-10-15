// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useState } from 'react';
import { api } from '../api.js';
import { useResource } from '../hooks.js';
import { dateTime, money } from '../format.js';
import { Empty, ErrorNote } from '../components/ui.jsx';

export default function Settlements() {
  const { data, error, reload } = useResource('/settlements');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [runError, setRunError] = useState(null);

  const run = async () => {
    setBusy(true);
    setRunError(null);
    try {
      const res = await api.post('/settlements/run');
      setMessage(res.settlement ? `Paid out ${money(res.settlement.payout)} for ${res.settlement.payment_count} payments.` : 'Nothing to settle yet. Payments become eligible a couple of minutes after capture.');
      await reload();
    } catch (err) {
      setRunError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settlements</h1>
          <p className="lede">The provider pays the platform what it owes, then the platform pays you everything in your balance. Both legs are booked in the ledger.</p>
        </div>
        <button className="btn" onClick={run} disabled={busy}>{busy ? 'Settling…' : 'Settle now'}</button>
      </div>
      {message && <div className="notice good" style={{ marginBottom: 14 }}>{message}</div>}
      <ErrorNote error={error || runError} />
      <section className="panel" style={{ padding: 0 }}>
        {data?.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Settlement</th><th>Date</th><th className="amount">Payments</th><th className="amount">Gross</th><th className="amount">Fees</th><th className="amount">Refunds</th><th className="amount">Paid to you</th></tr>
              </thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.id}>
                    <td className="code">{s.id}</td>
                    <td>{dateTime(s.created_at)}</td>
                    <td className="amount" style={{ fontFamily: 'var(--sans)' }}>{s.payment_count}</td>
                    <td className="amount">{money(s.gross)}</td>
                    <td className="amount">{money(s.fees)}</td>
                    <td className="amount">{money(s.refunds)}</td>
                    <td className="amount">{money(s.payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          data && <Empty title="No settlements yet">The worker settles every few minutes, or use Settle now.</Empty>
        )}
      </section>
    </>
  );
}
