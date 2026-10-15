// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Wordmark } from './Brand.jsx';

const LINKS = [
  ['/', 'Overview'],
  ['/payments', 'Payments'],
  ['/ledger', 'Ledger'],
  ['/webhooks', 'Webhooks'],
  ['/settlements', 'Settlements'],
  ['/reconciliation', 'Reconciliation'],
  ['/developers', 'Developers'],
];

export default function Layout() {
  const { merchant, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="rail">
        <NavLink to="/" className="brand" aria-label="Onyx home"><Wordmark size={30} /></NavLink>
        <nav className="nav" aria-label="Main">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          <span className="mode">Test mode</span>
          <div>
            <div style={{ fontWeight: 600 }}>{merchant?.name}</div>
            <div className="muted">{merchant?.email}</div>
          </div>
          <button className="btn ghost small" onClick={signOut} style={{ width: 'fit-content' }}>Sign out</button>
          <a className="credit" href="https://github.com/differentiatorX" target="_blank" rel="noreferrer">Built by differentiatorX</a>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
