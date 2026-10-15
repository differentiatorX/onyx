// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useResource } from '../hooks.js';
import { money } from '../format.js';
import { ErrorNote } from '../components/ui.jsx';
import LedgerTAccount from '../components/LedgerTAccount.jsx';

export default function Ledger() {
  const { data, error, reload, loading } = useResource('/ledger');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ledger</h1>
          <p className="lede">
            Every rupee is booked twice: once where it comes from, once where it goes. Balances are stored, and also recomputed from the journal below to prove they agree.
          </p>
        </div>
        <button className="btn ghost" onClick={reload} disabled={loading}>Check integrity again</button>
      </div>
      <ErrorNote error={error} />
      {data && (
        <div className="grid-2">
          <div className="stack">
            <section className="panel">
              <h2>Accounts</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Account</th><th>Type</th><th>Grows on</th><th className="amount">Balance</th></tr></thead>
                  <tbody>
                    {data.accounts.map((a) => (
                      <tr key={a.code}>
                        <td>{a.name}<div className="code muted">{a.code}</div></td>
                        <td>{a.type}</td>
                        <td>{a.normal_side}</td>
                        <td className="amount">{money(a.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <h2>Integrity check</h2>
              {data.integrity.balanced ? (
                <div className="notice good">All debits equal all credits, and every stored balance matches the journal.</div>
              ) : (
                <div className="notice bad">Drift found in: {data.integrity.driftAccounts.join(', ') || 'totals'}. Stored balances disagree with the journal.</div>
              )}
              <dl className="facts" style={{ marginTop: 14 }}>
                <dt>Total debits</dt><dd className="num">{money(data.integrity.totalDebits)}</dd>
                <dt>Total credits</dt><dd className="num">{money(data.integrity.totalCredits)}</dd>
              </dl>
            </section>
          </div>
          <section className="panel">
            <div className="panel-head">
              <h2>Journal</h2>
              <span className="muted small">Latest 50 entries, oldest first</span>
            </div>
            <LedgerTAccount entries={[...data.journal].reverse()} />
          </section>
        </div>
      )}
    </>
  );
}
