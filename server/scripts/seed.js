// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Seeds a demo merchant and pushes real traffic through the API, so the dashboard has
 * captures, failures, duplicates, refunds and webhook retries to show.
 * Requires the API and the worker to be running.  Usage: npm run seed
 */
const API = process.env.API_URL || 'http://localhost:4000';
const EMAIL = process.env.SEED_EMAIL || 'demo@onyx.dev';
const PASSWORD = process.env.SEED_PASSWORD || 'onyx-demo-123';
const COUNT = Number(process.env.SEED_PAYMENTS || 24);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { body, token, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function getCredentials() {
  const reg = await call('POST', '/api/dashboard/auth/register', { body: { name: 'Chai Point Demo Store', email: EMAIL, password: PASSWORD } });
  if (reg.status === 201) return { token: reg.json.token, apiKey: reg.json.api_key };
  const login = await call('POST', '/api/dashboard/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (login.status !== 200) throw new Error(`Could not sign in: ${JSON.stringify(login.json)}`);
  const roll = await call('POST', '/api/dashboard/keys/roll', { token: login.json.token });
  return { token: login.json.token, apiKey: roll.json.api_key };
}

const customers = ['aarav@example.com', 'diya@example.com', 'kabir@example.com', 'meera@example.com', 'rohan@example.com', 'saanvi@example.com', 'temp@mailinator.com'];
const items = ['Masala chai x2', 'Monthly tea subscription', 'Gift hamper', 'Assam CTC 500g', 'Office pantry order', 'Darjeeling first flush'];

async function main() {
  const { apiKey } = await getCredentials();
  const auth = { authorization: `Bearer ${apiKey}` };
  const created = [];

  for (let i = 0; i < COUNT; i += 1) {
    const key = `seed-${Date.now()}-${i}`;
    const body = {
      amount: (Math.floor(Math.random() * 4800) + 200) * 100,
      description: items[i % items.length],
      customer: { email: customers[i % customers.length], name: 'Demo customer' },
      metadata: { order_ref: `ORD-${1000 + i}` },
    };
    const res = await call('POST', '/v1/payments', { body, headers: { ...auth, 'idempotency-key': key } });
    if (i % 6 === 0) {
      // Retry with the same key: must replay, not create a second payment.
      const again = await call('POST', '/v1/payments', { body, headers: { ...auth, 'idempotency-key': key } });
      console.log(`retry with same key -> ${again.status}, same id: ${again.json.id === res.json.id}`);
    }
    if (res.status !== 201) {
      console.log('create failed', res.status, res.json);
      continue;
    }
    created.push(res.json);
  }

  for (const p of created) {
    if (!p.checkout_url || Math.random() < 0.15) continue; // some customers abandon checkout
    const url = new URL(p.checkout_url);
    const secret = url.searchParams.get('secret');
    await call('POST', `/api/checkout/${p.id}/confirm?secret=${encodeURIComponent(secret)}`, { body: { method: 'card', simulate: 'auto' } });
  }
  console.log(`Created ${created.length} payments; waiting for the mock bank...`);
  await sleep(8000);

  let refunded = 0;
  for (const p of created.slice(0, 10)) {
    const cur = await call('GET', `/v1/payments/${p.id}`, { headers: auth });
    if (cur.json.status === 'captured' && refunded < 3) {
      await call('POST', `/v1/payments/${p.id}/refunds`, { body: { amount: Math.floor(cur.json.amount / 2), reason: 'Customer returned part of the order' }, headers: { ...auth, 'idempotency-key': `seed-refund-${p.id}` } });
      refunded += 1;
    }
  }

  console.log('\nDone. Sign in to the dashboard with:');
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  API key:  ${apiKey}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
