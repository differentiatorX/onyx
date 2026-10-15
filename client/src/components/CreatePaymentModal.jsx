// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useState } from 'react';
import { api } from '../api.js';
import { toPaise, money } from '../format.js';
import { CopyText, ErrorNote, Modal } from './ui.jsx';

export default function CreatePaymentModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ amount: '499', email: 'customer@example.com', description: 'Test order' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await api.post('/payments', { amount: toPaise(form.amount), description: form.description || undefined, customer: { email: form.email } });
      setCreated(p);
      onCreated?.(p);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Modal title="Payment created" onClose={onClose}>
        <div className="form">
          {created.status === 'blocked' ? (
            <div className="notice bad">Risk rules blocked this payment: {created.risk.reasons.map((r) => r.message).join('; ')}</div>
          ) : (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Send the customer to checkout to pay {money(created.amount)}. Pick an outcome there to watch success, decline or a silent bank.
              </p>
              <div className="secret-box code">{created.checkout_url}</div>
              <div className="row">
                <a className="btn" href={created.checkout_url} target="_blank" rel="noreferrer">Open checkout</a>
                <CopyText value={created.checkout_url} label="Copy link" />
              </div>
            </>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create a test payment" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="amount">Amount in rupees</label>
          <input id="amount" className="input num" inputMode="decimal" value={form.amount} onChange={set('amount')} required />
        </div>
        <div className="field">
          <label htmlFor="email">Customer email</label>
          <input id="email" className="input" type="email" value={form.email} onChange={set('email')} required />
          <span className="help">Use a mailinator.com address or repeat one quickly to trigger risk rules.</span>
        </div>
        <div className="field">
          <label htmlFor="desc">Description</label>
          <input id="desc" className="input" value={form.description} onChange={set('description')} maxLength={255} />
        </div>
        <ErrorNote error={error} />
        <div className="row">
          <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create payment'}</button>
        </div>
      </form>
    </Modal>
  );
}
