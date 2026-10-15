// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useResource } from '../hooks.js';
import { EVENT_LABELS, dateTime, timeAgo } from '../format.js';
import { CopyText, Empty, ErrorNote, Modal, StatusPill } from '../components/ui.jsx';

export default function Webhooks() {
  const [filter, setFilter] = useState('');
  const { data, error, reload } = useResource(`/webhooks${filter ? `?status=${filter}` : ''}`, { pollMs: 3000 });
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [inspecting, setInspecting] = useState(null);
  const [actionError, setActionError] = useState(null);

  const act = async (fn) => {
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setActionError(err);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Webhooks</h1>
          <p className="lede">We tell your server when payments and refunds change. Failed deliveries retry with growing gaps, then stop so you can replay them.</p>
        </div>
        <button className="btn" onClick={() => setAdding(true)}>Add endpoint</button>
      </div>
      <ErrorNote error={error || actionError} />

      {data && (
        <>
          <section className="panel">
            <h2>Endpoints</h2>
            {data.endpoints.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>URL</th><th>Events</th><th>Signing secret</th><th /></tr></thead>
                  <tbody>
                    {data.endpoints.map((e) => (
                      <tr key={e.id}>
                        <td><div className="code">{e.url}</div>{e.description && <div className="muted small">{e.description}</div>}</td>
                        <td>{e.events.includes('*') ? 'All events' : e.events.join(', ')}</td>
                        <td>
                          <div className="code">{revealed[e.id] || e.secret}</div>
                          {!revealed[e.id] ? (
                            <button className="btn ghost small" style={{ marginTop: 6 }} onClick={() => act(async () => { const r = await api.post(`/webhooks/endpoints/${e.id}/reveal`); setRevealed((x) => ({ ...x, [e.id]: r.secret })); })}>Reveal</button>
                          ) : (
                            <div style={{ marginTop: 6 }}><CopyText value={revealed[e.id]} /></div>
                          )}
                        </td>
                        <td><button className="btn danger small" onClick={() => act(() => api.del(`/webhooks/endpoints/${e.id}`))}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No endpoints">Add one to start receiving events.</Empty>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Recent deliveries</h2>
              <div className="segments" role="group" aria-label="Filter deliveries">
                <button aria-pressed={filter === ''} onClick={() => setFilter('')}>All</button>
                <button aria-pressed={filter === 'failing'} onClick={() => setFilter('failing')}>Failing</button>
              </div>
            </div>
            {data.deliveries.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Event</th><th>Status</th><th>Tries</th><th>Last error</th><th>Created</th><th /></tr></thead>
                  <tbody>
                    {data.deliveries.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {EVENT_LABELS[d.event_type] || d.event_type}
                          <div className="small">{d.object_id?.startsWith('pay_') ? <Link to={`/payments/${d.object_id}`}>{d.object_id}</Link> : <span className="code muted">{d.object_id}</span>}</div>
                        </td>
                        <td><StatusPill status={d.status} /></td>
                        <td className="num">{d.attempt_count}</td>
                        <td className="muted small">{d.last_error || '—'}</td>
                        <td className="muted">{timeAgo(d.created_at)}</td>
                        <td>
                          <div className="row">
                            <button className="btn ghost small" onClick={() => setInspecting(d)}>Attempts</button>
                            {d.status !== 'succeeded' && <button className="btn ghost small" onClick={() => act(() => api.post(`/webhooks/deliveries/${d.id}/replay`))}>Replay</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title={filter ? 'Nothing failing' : 'No deliveries yet'}>{filter ? 'Every webhook reached its endpoint.' : 'Deliveries appear after a payment changes state.'}</Empty>
            )}
          </section>
        </>
      )}

      {adding && <AddEndpoint onClose={() => setAdding(false)} onAdded={reload} />}
      {inspecting && (
        <Modal title="Delivery attempts" onClose={() => setInspecting(null)}>
          <p className="muted small" style={{ marginTop: 0 }}>Event <span className="code">{inspecting.event_id}</span> to <span className="code">{inspecting.url}</span></p>
          <table>
            <thead><tr><th>Try</th><th>When</th><th>Response</th><th className="amount">Time</th></tr></thead>
            <tbody>
              {inspecting.attempts.map((a, i) => (
                <tr key={i}>
                  <td className="num">{a.attempt_number}</td>
                  <td>{dateTime(a.at)}</td>
                  <td>{a.error ? <span style={{ color: 'var(--debit)' }}>{a.error}</span> : <span style={{ color: 'var(--credit)' }}>{a.status_code} OK</span>}</td>
                  <td className="amount" style={{ fontFamily: 'var(--sans)' }}>{a.duration_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </>
  );
}

function AddEndpoint({ onClose, onAdded }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    try {
      setCreated(await api.post('/webhooks/endpoints', { url, events: ['*'] }));
      onAdded();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Modal title={created ? 'Endpoint added' : 'Add an endpoint'} onClose={onClose}>
      {created ? (
        <div className="form">
          <p className="muted" style={{ margin: 0 }}>Verify every request with this signing secret. It is shown in full only here and when you reveal it.</p>
          <div className="secret-box code">{created.secret}</div>
          <CopyText value={created.secret} label="Copy secret" />
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="url">URL</label>
            <input id="url" className="input" type="url" placeholder="https://example.com/onyx/webhooks" value={url} onChange={(e) => setUrl(e.target.value)} required />
            <span className="help">Tip: a webhook.site URL lets you watch requests arrive.</span>
          </div>
          <ErrorNote error={error} />
          <button className="btn">Add endpoint</button>
        </form>
      )}
    </Modal>
  );
}
