// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Rule-based risk scoring. Pure function: counters are passed in, so it is trivially testable.
 * Score is capped at 100. allow < reviewScore <= review < blockScore <= block.
 */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
]);

const DEFAULT_RISK_CONFIG = Object.freeze({
  reviewScore: 50,
  blockScore: 80,
  velocityWindowMinutes: 10,
  velocityLimit: 5,
  failureWindowMinutes: 15,
  failureLimit: 3,
  largeFirstPayment: 2000000, // Rs 20,000 in paise
});

function evaluateRisk(input, config = DEFAULT_RISK_CONFIG) {
  const reasons = [];
  let score = 0;
  const add = (points, code, message) => {
    score += points;
    reasons.push({ code, points, message });
  };

  if (input.maxAmount && input.amount > input.maxAmount) {
    add(100, 'amount_over_limit', 'Amount is above this merchant\'s per-payment limit');
  }

  const domain = String(input.email || '').split('@')[1]?.toLowerCase();
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    add(40, 'disposable_email', `Customer uses a disposable email domain (${domain})`);
  }

  if ((input.recentPaymentsByEmail || 0) >= config.velocityLimit) {
    add(50, 'high_velocity', `${input.recentPaymentsByEmail} payments from this customer in the last ${config.velocityWindowMinutes} minutes`);
  }

  if ((input.recentFailuresByEmail || 0) >= config.failureLimit) {
    add(80, 'repeated_failures', `${input.recentFailuresByEmail} failed payments from this customer in the last ${config.failureWindowMinutes} minutes`);
  }

  if (input.isFirstTimeCustomer && input.amount >= config.largeFirstPayment) {
    add(30, 'large_first_payment', 'Large amount from a customer with no payment history');
  }

  score = Math.min(score, 100);
  const decision = score >= config.blockScore ? 'block' : score >= config.reviewScore ? 'review' : 'allow';
  return { score, decision, reasons };
}

module.exports = { evaluateRisk, DEFAULT_RISK_CONFIG, DISPOSABLE_DOMAINS };
