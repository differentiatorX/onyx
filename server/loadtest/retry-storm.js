// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * k6 load test: "retry storm". Every iteration fires 5 concurrent requests with the SAME
 * Idempotency-Key, like a client that times out and retries aggressively.
 * Pass condition: exactly one payment id per key, never two.
 *
 *   k6 run -e API_KEY=sk_test_... -e API_URL=http://localhost:4000 loadtest/retry-storm.js
 *
 * Raise RATE_LIMIT_CAPACITY / RATE_LIMIT_REFILL_PER_SEC on the API first, or most requests get 429.
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const duplicates = new Counter('duplicate_payments_created');
const API = __ENV.API_URL || 'http://localhost:4000';

export const options = {
  scenarios: { storm: { executor: 'constant-vus', vus: 30, duration: '30s' } },
  thresholds: {
    duplicate_payments_created: ['count==0'],
    'http_req_duration{expected_response:true}': ['p(95)<300'],
  },
};

http.setResponseCallback(http.expectedStatuses(200, 201, 409, 429));

export default function () {
  const key = `k6-${__VU}-${__ITER}-${Date.now()}`;
  const params = { headers: { 'content-type': 'application/json', authorization: `Bearer ${__ENV.API_KEY}`, 'idempotency-key': key } };
  const body = JSON.stringify({ amount: 49900, customer: { email: `load-${__VU}@example.com` }, description: 'k6 retry storm' });
  const responses = http.batch(Array.from({ length: 5 }, () => ['POST', `${API}/v1/payments`, body, params]));
  const ids = new Set(responses.filter((r) => r.status === 200 || r.status === 201).map((r) => r.json('id')));
  if (ids.size > 1) duplicates.add(ids.size - 1);
  check(ids, { 'at most one payment per idempotency key': (s) => s.size <= 1 });
}
