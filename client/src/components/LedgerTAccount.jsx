// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { ACCOUNT_NAMES, dateTime, money } from '../format.js';

const ENTRY_LABELS = { capture: 'Capture', refund: 'Refund', provider_settlement: 'Provider settlement', payout: 'Payout to merchant' };

/**
 * Journal entries drawn as a T-account: debits left, credits right, totals closed
 * with the accountant's double rule. If the columns ever disagree, it says so.
 */
export default function LedgerTAccount({ entries }) {
  if (!entries?.length) {
    return <p className="muted small">Nothing booked yet. Entries appear here the moment money moves.</p>;
  }
  let debits = 0;
  let credits = 0;
  for (const e of entries) for (const l of e.lines) (l.direction === 'debit' ? (debits += l.amount) : (credits += l.amount));
  const balanced = debits === credits;

  return (
    <>
      <div className="taccount table-wrap">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th className="col-dr">Debit</th>
              <th className="col-cr">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => [
              <tr key={e.id} className="entry-row">
                <td colSpan={3}>
                  <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{ENTRY_LABELS[e.type] || e.type}</strong> on {dateTime(e.created_at)}
                  <span className="code" style={{ float: 'right' }}>{e.id}</span>
                </td>
              </tr>,
              ...e.lines.map((l, i) => (
                <tr key={`${e.id}-${i}`}>
                  <td className={l.direction === 'credit' ? 'indent' : ''}>{ACCOUNT_NAMES[l.account] || l.account}</td>
                  <td className="col-dr">{l.direction === 'debit' ? money(l.amount) : ''}</td>
                  <td className="col-cr">{l.direction === 'credit' ? money(l.amount) : ''}</td>
                </tr>
              )),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td>Totals</td>
              <td className="col-dr"><span>{money(debits)}</span></td>
              <td className="col-cr"><span>{money(credits)}</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className={`balanced ${balanced ? '' : 'off'}`}>
        {balanced ? 'Debits equal credits. These books balance.' : `Out of balance by ${money(Math.abs(debits - credits))}. This is a bug; check the journal.`}
      </div>
    </>
  );
}
