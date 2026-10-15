# Defending Onyx in an interview

*Onyx by [differentiatorX](https://github.com/differentiatorX), [madhur.m2006@gmail.com](mailto:madhur.m2006@gmail.com)*

Interviewers will pick one feature and keep asking "why" until you hit the bottom. Each answer below points at the file that implements it. Read the file, then say the answer out loud in your own words without looking.

## Learn the codebase in 7 days

1. `domain/` folder only. It is pure logic with no database. Run `npm test` and break a test on purpose.
2. `paymentService.js`: `createPayment`, `transition`, `markCaptured`. Trace one payment from API call to captured.
3. `ledgerService.js` and `domain/ledger.js`. Work a capture, refund and payout on paper and check it balances.
4. `middleware/idempotency.js`. Draw the four cases (new, replay, mismatch, in progress) on paper.
5. `providerEventService.js` and `providers/mockbank.js`. Follow a duplicate and a reordered webhook.
6. `webhookService.js` and `worker.js`. Outbox, fan-out, retries, dead letter.
7. Run the demo, break things (stop the worker, kill Redis), and watch what happens.

## The 30-second pitch

"Onyx is a Razorpay-style payment gateway on MERN. The interesting part isn't the checkout, it's correctness under failure: idempotent APIs so retries never double-charge, a double-entry ledger where every rupee is booked twice and verified, a transactional outbox so webhooks can't be lost, and a deliberately unreliable mock bank that sends duplicate and out-of-order webhooks so I could prove the system handles them."

## Idempotency

**Q: What happens if a merchant's request times out and they retry?**
The client sends the same `Idempotency-Key`. The middleware hashes method, path and body into a fingerprint, then tries to insert a record with a unique index on `(merchantId, key)`. The first request wins the insert and runs. A retry hits the duplicate-key error, finds the record, and either replays the stored response (if finished), returns 409 (if still running), or 422 (if the body is different). See `middleware/idempotency.js`.

**Q: Why claim the key before running the handler instead of checking after?**
Check-then-act races. Two concurrent retries would both see "no record" and both create a payment. The unique index makes the claim atomic in the database.

**Q: Why store the response before sending it?**
If you send first, a fast retry can arrive while the record still says "in progress" and get a 409 for a request that actually succeeded. Persist, then send.

**Q: Why not store 409, 429 or 5xx responses?**
Those are transient. Storing them would replay a temporary failure forever. 4xx validation errors are stored, matching Stripe.

**Q: What if the server crashes mid-request?**
The record stays `in_progress` with a `lockedAt`. After 60 seconds a retry can take over the stale lock with a conditional update on `lockedAt`, so only one retry wins.

**Q: Why both Redis and MongoDB?**
Redis is the fast path for replays. MongoDB is the source of truth with a TTL index. If Redis is down, it falls back to Mongo.

## Ledger

**Q: Why double-entry instead of a balance field?**
A single balance can drift silently. With double-entry, every movement has a source and destination, debits must equal credits, and any balance can be recomputed from the journal. `verifyIntegrity` does exactly that.

**Q: Walk me through a ₹1,000 capture with a 2% fee.**
Debit "Due from provider" 1,000; credit "Owed to merchant" 980; credit "Fee revenue" 20. Debits 1,000, credits 1,000.

**Q: How do you stop a capture being booked twice?**
Each entry has a unique `idempotencyKey` like `capture:pay_x`. Posting checks for it inside the transaction, and the unique index is the backstop if two transactions race.

**Q: Why integers?**
`0.1 + 0.2 !== 0.3`. All money is integer paise. Fees round half up with integer math in `lib/money.js`.

**Q: Why are journal entries never updated?**
Append-only is an audit trail. Mistakes are corrected with a new reversing entry.

## Transactions and consistency

**Q: Why does MongoDB need a replica set here?**
Multi-document transactions only work on replica sets. The capture changes the payment, writes a journal entry, updates account balances and writes an outbox event. All or nothing.

**Q: What is the transactional outbox and why use it?**
If I committed the payment and then called Redis to enqueue a webhook, a crash in between loses the webhook forever. Instead the event is written in the same transaction. A worker relays unpublished events. If it crashes mid-relay, the unique `(eventId, endpointId)` index and BullMQ `jobId` make the second relay harmless.

**Q: Optimistic or pessimistic locking?**
Optimistic. Every status update matches on the `version` it read and increments it. If someone else changed the payment, the update matches nothing and we re-read and retry. Locks would serialize all work on hot payments.

## Webhooks from the bank

**Q: The bank sends the same webhook three times. What happens?**
Unique index on `(provider, eventId)`. The second insert fails, we count it as a duplicate and return 200 so the bank stops retrying.

**Q: "Authorized" arrives after "Captured".**
The state machine has no edge from `captured` to `authorized`. The event is marked ignored with the reason. Nothing moves backwards.

**Q: Why respond 200 before processing?**
Providers time out slow endpoints and retry. We verify, store and enqueue in milliseconds, and process in a worker.

**Q: Why the raw body for signature checks?**
The HMAC is over exact bytes. Parsing and re-serializing JSON can change key order or whitespace and break verification. That route is mounted before `express.json()`.

**Q: The webhook never arrives.**
`pollStuck` runs every 30 seconds and asks the provider about payments stuck in processing. Try "Bank never calls back" in the demo.

## Webhooks to merchants

**Q: Merchant's server is down for an hour.**
BullMQ retries with exponential backoff, 8 attempts. Then the delivery moves to `dead` and the merchant can replay it from the dashboard.

**Q: How does a merchant know the webhook came from you?**
`Onyx-Signature: t=<timestamp>,v1=<hmac>`. The timestamp is inside the HMAC and checked against a 5-minute window, which blocks replay attacks.

**Q: SSRF?**
With `ENABLE_DEV_ROUTES=false`, endpoint URLs must be https and cannot point at private IP ranges like 127.0.0.1 or 10.x. Dev mode allows them so the built-in test sink works. A stricter version would also resolve DNS and check the resolved IP.

## Refunds

**Q: Two refund requests at the same moment for the full amount.**
The refund reserves its amount with one conditional update: increment `amountRefundPending` only if `refunded + pending + new <= amount`. MongoDB applies it atomically, so only one can pass.

**Q: The bank's refund API fails.**
The job retries with exponential backoff. If every retry fails, the reservation is released and `refund.failed` is sent.

## Scale and operations

**Q: How would this scale?**
The API is stateless, so run more instances behind a load balancer. Rate limiting and idempotency live in Redis and Mongo, so they work across instances. Workers scale horizontally; BullMQ ensures one worker per job. Next steps: shard payments by merchant, move the relay to MongoDB change streams, and partition queues by merchant to stop one noisy merchant starving others.

**Q: How does the rate limiter work across many API servers?**
Token bucket in a Redis Lua script, which runs atomically. It uses Redis server time, so clocks on API servers don't matter. If Redis is down it fails open so payments keep working.

**Q: What would you change for real production?**
Per-payment T+2 settlement instead of a sweep, a platform-wide general ledger, encryption of webhook secrets at rest, refresh tokens for the dashboard, structured metrics and alerts on dead letters and ledger drift, and PCI scope review (card data never touches Onyx; the provider's checkout handles it).

## Honest answers you should have ready

- "Which parts did you write?" Be truthful. If you studied the two credited repos for patterns, say so and explain what you changed and why.
- "What was hardest?" A good honest answer: getting retries, duplicates and reordering to all be safe at the same time, and proving the ledger stays balanced through refunds after settlement.
- "What would break first under load?" The outbox relay polls MongoDB every second with concurrency 1. Change streams or partitioned relays fix it.
