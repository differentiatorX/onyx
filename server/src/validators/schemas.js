// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { z } = require('zod');
const { STATUSES } = require('../domain/paymentStateMachine');

const amount = z.number({ invalid_type_error: 'amount must be an integer in paise' }).int('amount must be an integer in paise').positive().max(10_000_000_000);

const createPayment = z.object({
  amount,
  currency: z.literal('INR').default('INR'),
  description: z.string().max(255).optional(),
  customer: z.object({
    email: z.string().email(),
    name: z.string().max(120).optional(),
    contact: z.string().max(20).optional(),
  }),
  metadata: z
    .record(z.string().max(40), z.string().max(500))
    .refine((m) => Object.keys(m).length <= 20, 'metadata can have at most 20 keys')
    .optional(),
});

const createRefund = z.object({
  amount: amount.optional(),
  reason: z.string().max(255).optional(),
});

const listPayments = z.object({
  status: z.enum(STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
});

const webhookEndpoint = z.object({
  url: z.string().url().max(500),
  events: z.array(z.string().max(60)).min(1).max(20).default(['*']),
  description: z.string().max(200).optional(),
});

const register = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

const login = z.object({ email: z.string().email(), password: z.string().min(1) });

const confirmCheckout = z
  .object({
    method: z.enum(['card', 'upi', 'netbanking']).optional(),
    simulate: z.enum(['auto', 'success', 'failure', 'timeout']).optional(),
    razorpay_payment_id: z.string().optional(),
    razorpay_order_id: z.string().optional(),
    razorpay_signature: z.string().optional(),
  })
  .strict();

module.exports = { createPayment, createRefund, listPayments, webhookEndpoint, register, login, confirmCheckout };
