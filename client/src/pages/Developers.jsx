// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useState } from 'react';
import { api } from '../api.js';
import { useResource } from '../hooks.js';
import { timeAgo } from '../format.js';
import { CopyText, ErrorNote, Modal } from '../components/ui.jsx';

const API_BASE = 'http://localhost:4000';

const createSnippet = (key) => `curl ${API_BASE}/v1/payments \\
  -H "Authorization: Bearer ${key}" \\
  -H "Idempotency-Key: order-1042" \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 49900, "description": "Order #1042",
       "customer": {"email": "riya@example.com"}}'`;

const refundSnippet = (key) => `curl ${API_BASE}/v1/payments/pay_XXXX/refunds \\
  -H "Authorization: Bearer ${key}" \\
  -H "Idempotency-Key: refund-1042-1" \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 10000, "reason": "Damaged item"}'`;

const verifySnippet = `const crypto = require('crypto');

// Use the raw request body, not re-serialised JSON.
function verifyOnyx(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (age > 300) return false; // reject replays
  const expected = crypto.createHmac('sha256', secret)
    .update(\`\${parts.t}.\${rawBody}\`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}`;

export default function Developers() {
  const { data, error, reload } = useResource('/keys');
  const [newKey, setNewKey] = useState(null);
  const [rollError, setRollError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const active = data?.data.find((k) => !k.revoked);
  const shownKey = newKey || 'sk_test_your_key';

  const roll = async () => {
    setRollError(null);
    try {
      const res = await api.post('/keys/roll');
      setNewKey(res.api_key);
      setConfirming(false);
      reload();
    } catch (err) {
      setRollError(err);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Developers</h1>
          <p className="lede">Your server talks to Onyx with a secret key. Send an Idempotency-Key with every POST and retries can never double-charge.</p>
        </div>
      </div>
      <ErrorNote error={error || rollError} />

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>Secret key</h2>
            <button className="btn ghost small" onClick={() => setConfirming(true)}>Roll key</button>
          </div>
          {newKey ? (
            <div className="form">
              <div className="notice wait">Copy this now. It will not be shown again, and the old key has stopped working.</div>
              <div className="secret-box code">{newKey}</div>
              <CopyText value={newKey} label="Copy key" />
            </div>
          ) : active ? (
            <dl className="facts">
              <dt>Key</dt><dd className="code">{active.display}</dd>
              <dt>Mode</dt><dd>{active.mode}</dd>
              <dt>Last used</dt><dd>{active.last_used_at ? timeAgo(active.last_used_at) : 'Never'}</dd>
            </dl>
          ) : (
            <p className="muted">No active key. Roll one to start.</p>
          )}
        </section>
        <section className="panel">
          <h2>Limits</h2>
          <dl className="facts">
            <dt>Rate limit</dt><dd>100 requests burst, then 20 per second per key</dd>
            <dt>Idempotency</dt><dd>Keys remembered for 24 hours</dd>
            <dt>Amounts</dt><dd>Integers in paise: 49900 is ₹499.00</dd>
          </dl>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><h2>Create a payment</h2><CopyText value={createSnippet(shownKey)} /></div>
        <pre className="snippet">{createSnippet(shownKey)}</pre>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Refund part of it</h2><CopyText value={refundSnippet(shownKey)} /></div>
        <pre className="snippet">{refundSnippet(shownKey)}</pre>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Verify a webhook in Node.js</h2><CopyText value={verifySnippet} /></div>
        <pre className="snippet">{verifySnippet}</pre>
      </section>

      {confirming && (
        <Modal title="Roll your secret key?" onClose={() => setConfirming(false)}>
          <p style={{ marginTop: 0 }}>Your current key stops working immediately. Any server using it will get 401 errors until you update it.</p>
          <div className="row">
            <button className="btn danger" onClick={roll}>Roll key</button>
            <button className="btn ghost" onClick={() => setConfirming(false)}>Keep current key</button>
          </div>
        </Modal>
      )}
    </>
  );
}
