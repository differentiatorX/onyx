// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Every status change goes through this table. Webhooks that would move a payment
 * backwards (an "authorized" event arriving after "captured") are rejected here,
 * which is what makes out-of-order delivery safe.
 */
const TRANSITIONS = Object.freeze({
  created: ['processing', 'authorized', 'captured', 'failed', 'expired'],
  processing: ['authorized', 'captured', 'failed'],
  authorized: ['captured', 'failed', 'expired'],
  captured: ['partially_refunded', 'refunded'],
  partially_refunded: ['partially_refunded', 'refunded'],
  failed: [],
  expired: [],
  refunded: [],
  blocked: [],
});

const STATUSES = Object.freeze(Object.keys(TRANSITIONS));
const CAPTURED_STATES = Object.freeze(['captured', 'partially_refunded', 'refunded']);
const REFUNDABLE_STATES = Object.freeze(['captured', 'partially_refunded']);

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
const isTerminal = (status) => (TRANSITIONS[status] || []).length === 0;
const allowedFrom = (to) => STATUSES.filter((from) => TRANSITIONS[from].includes(to));

module.exports = { TRANSITIONS, STATUSES, CAPTURED_STATES, REFUNDABLE_STATES, canTransition, isTerminal, allowedFrom };
