// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { CopyText, ErrorNote } from '../components/ui.jsx';
import { Wordmark } from '../components/Brand.jsx';

export function Login() {
  const { merchant, signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('demo@onyx.dev');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (merchant) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      nav('/');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-page">
      <div className="auth-card">
        <span className="brand"><Wordmark size={34} /></span>
        <h1 style={{ fontSize: 26 }}>Sign in to your dashboard</h1>
        <p className="lede">Payments, set in stone. Every rupee booked twice, every webhook accounted for.</p>
        <form className="form panel" style={{ marginTop: 20 }} onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <ErrorNote error={error} />
          <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="small muted" style={{ margin: 0 }}>
            New here? <Link to="/register">Create a test account</Link>
          </p>
        </form>
        <p className="credit" style={{ textAlign: 'center', marginTop: 18 }}>
          Built by <a href="https://github.com/differentiatorX" target="_blank" rel="noreferrer">differentiatorX</a>
        </p>
      </div>
    </div>
  );
}

export function Register() {
  const { register, setMerchant } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await register(form.name, form.email, form.password));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="center-page">
        <div className="auth-card">
          <span className="brand"><Wordmark size={34} /></span>
          <h1 style={{ fontSize: 26 }}>Save your secret key</h1>
          <p className="lede">This is the only time it is shown. Your server uses it to create payments and refunds.</p>
          <div className="panel form" style={{ marginTop: 20 }}>
            <div className="secret-box code">{result.apiKey}</div>
            <div className="row">
              <CopyText value={result.apiKey} label="Copy key" />
            </div>
            <button className="btn" onClick={() => { setMerchant(result.merchant); nav('/'); }}>I saved it, open the dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="center-page">
      <div className="auth-card">
        <span className="brand"><Wordmark size={34} /></span>
        <h1 style={{ fontSize: 26 }}>Create a test account</h1>
        <p className="lede">Test mode only. Money moves through the mock bank, never a real card.</p>
        <form className="form panel" style={{ marginTop: 20 }} onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">Business name</label>
            <input id="name" className="input" value={form.name} onChange={set('name')} required minLength={2} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
            <span className="help">At least 8 characters.</span>
          </div>
          <ErrorNote error={error} />
          <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          <p className="small muted" style={{ margin: 0 }}>
            Already have one? <Link to="/login">Sign in</Link>
          </p>
        </form>
        <p className="credit" style={{ textAlign: 'center', marginTop: 18 }}>
          Built by <a href="https://github.com/differentiatorX" target="_blank" rel="noreferrer">differentiatorX</a>
        </p>
      </div>
    </div>
  );
}
