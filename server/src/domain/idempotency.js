// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Decide what to do when an Idempotency-Key was already seen.
 *   payload_mismatch  same key, different body: client bug, reject with 422
 *   replay            first request finished: return the stored response
 *   in_progress       first request still running: 409, client retries later
 *   stale_lock        first request crashed mid-flight: safe to take over
 */
function classifyExisting(record, fingerprint, { now = Date.now(), lockTimeoutMs = 60000 } = {}) {
  if (record.requestHash !== fingerprint) return 'payload_mismatch';
  if (record.state === 'completed') return 'replay';
  if (now - new Date(record.lockedAt).getTime() > lockTimeoutMs) return 'stale_lock';
  return 'in_progress';
}

/** Which outcomes are safe to replay. 5xx, 409 and 429 are transient, so the client may retry them. */
const isStorableStatus = (status) => status < 500 && status !== 409 && status !== 429;

module.exports = { classifyExisting, isStorableStatus };
