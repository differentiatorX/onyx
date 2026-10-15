// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { checkoutApi } from '../api.js';
import { money } from '../format.js';
import { OnyxMark } from '../components/Brand.jsx';

const OUTCOMES = [
  ['auto', 'Let the bank decide'],
  ['success', 'Bank approves'],
  ['failure', 'Bank declines'],
  ['timeout', 'Bank never calls back'],
];
const DONE = new Set(['captured', 'failed', 'expired', 'blocked', 'refunded', 'partially_refunded']);

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Razorpay Checkout'));
    document.body.appendChild(s);
  });
}

export default function Checkout() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const secret = params.get('secret') || '';
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState(null);
  const [method, setMethod] = useState('card');
  const [outcome, setOutcome] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [waitedLong, setWaitedLong] = useState(false);
  const pollStarted = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setPayment(await checkoutApi.get(id, secret));
    } catch (err) {
      setError(err);
    }
  }, [id, secret]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while the bank is working.
  useEffect(() => {
    if (!payment || DONE.has(payment.status) || payment.status === 'created') return undefined;
    if (!pollStarted.current) pollStarted.current = Date.now();
    const t = setTimeout(() => {
      if (Date.now() - pollStarted.current > 15000) setWaitedLong(true);
      refresh();
    }, 1500);
    return () => clearTimeout(t);
  }, [payment, refresh]);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const cfg = payment.provider_config;
      if (cfg?.provider === 'razorpay') {
        await loadRazorpayScript();
        await new Promise((resolve, reject) => {
          const rzp = new window.Razorpay({
            key: cfg.key_id,
            order_id: cfg.order_id,
            amount: cfg.amount,
            currency: cfg.currency,
            name: payment.merchant_name,
            description: payment.description || undefined,
            prefill: { email: payment.customer_email || undefined },
            handler: async (resp) => {
              try {
                setPayment(await checkoutApi.confirm(id, secret, resp));
                resolve();
              } catch (err) {
                reject(err);
              }
            },
            modal: { ondismiss: () => resolve() },
          });
          rzp.open();
        });
      } else {
        setPayment(await checkoutApi.confirm(id, secret, { method, simulate: outcome }));
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (error && !payment) {
    return (
      <div className="center-page">
        <div className="checkout"><div className="checkout-body"><div className="notice bad">{error.message}</div></div></div>
      </div>
    );
  }
  if (!payment) return <div className="boot">Loading checkout…</div>;

  const isMock = payment.provider_config?.provider === 'mockbank';
  return (
    <div className="center-page">
      <div className="checkout">
        <div className="checkout-head">
          <div className="merchant">{payment.merchant_name}</div>
          {payment.description && <div className="muted small">{payment.description}</div>}
          <div className="amount">{money(payment.amount)}</div>
        </div>
        <div className="checkout-body">
          {payment.status === 'created' && (
            <>
              {isMock && (
                <>
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="small" style={{ fontWeight: 500, marginBottom: 6 }}>Pay with</legend>
                    <div className="methods">
                      {[['card', 'Card'], ['upi', 'UPI'], ['netbanking', 'Netbanking']].map(([v, l]) => (
                        <label key={v}>
                          <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} />
                          {l}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="field">
                    <label htmlFor="outcome">Test outcome</label>
                    <select id="outcome" className="select" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                      {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <span className="help">Test mode. No real money moves.</span>
                  </div>
                </>
              )}
              {error && <div className="notice bad">{error.message}</div>}
              <button className="btn" style={{ justifyContent: 'center', padding: '11px 14px' }} onClick={pay} disabled={busy}>
                {busy ? 'Contacting your bank…' : `Pay ${money(payment.amount)}`}
              </button>
            </>
          )}

          {['processing', 'authorized'].includes(payment.status) && (
            <div className="row" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <div>
                <div style={{ fontWeight: 600 }}>Waiting for your bank</div>
                <div className="muted small">
                  {waitedLong ? 'Your bank has not replied yet. You can close this page; we will confirm the payment as soon as the bank does.' : 'This usually takes a few seconds.'}
                </div>
              </div>
            </div>
          )}

          {['captured', 'partially_refunded', 'refunded'].includes(payment.status) && (
            <div aria-live="polite">
              <div className="result-mark" style={{ color: 'var(--credit)' }}>Payment received</div>
              <p className="muted" style={{ margin: '4px 0 0' }}>{payment.merchant_name} has been told. A receipt goes to {payment.customer_email}.</p>
            </div>
          )}

          {payment.status === 'failed' && (
            <div aria-live="polite">
              <div className="result-mark" style={{ color: 'var(--debit)' }}>Payment declined</div>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Your bank said: {(payment.failure_reason || 'declined').replace(/_/g, ' ')}. No money was taken. Ask {payment.merchant_name} for a new payment link to try again.
              </p>
            </div>
          )}

          {payment.status === 'expired' && <div className="notice">This payment link has expired. Ask {payment.merchant_name} for a new one.</div>}
          {payment.status === 'blocked' && <div className="notice bad">This payment could not be accepted. Contact {payment.merchant_name}.</div>}
        </div>
        <div className="checkout-foot">
          <OnyxMark size={16} />
          <span>Secured by Onyx</span>
        </div>
      </div>
    </div>
  );
}
