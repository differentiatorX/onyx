// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
require('dotenv').config();
const { z } = require('zod');

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    LOG_LEVEL: z.string().default('info'),
    MONGO_URI: z.string().default('mongodb://localhost:27017/onyx?directConnection=true'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(16).default('change-me-in-production-0123456789'),
    JWT_TTL: z.string().default('12h'),
    CLIENT_URL: z.string().default('http://localhost:5173'),
    INTERNAL_API_URL: z.string().default('http://localhost:4000'),
    PAYMENT_PROVIDER: z.enum(['mockbank', 'razorpay']).default('mockbank'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    MOCKBANK_WEBHOOK_SECRET: z.string().default('mockbank_dev_secret'),
    MOCKBANK_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.1),
    MOCKBANK_TIMEOUT_RATE: z.coerce.number().min(0).max(1).default(0.05),
    MOCKBANK_DUPLICATE_RATE: z.coerce.number().min(0).max(1).default(0.2),
    MOCKBANK_REORDER_RATE: z.coerce.number().min(0).max(1).default(0.15),
    MOCKBANK_REFUND_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.2),
    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(1000).default(200),
    PAYMENT_EXPIRY_MINUTES: z.coerce.number().int().positive().default(30),
    STUCK_PAYMENT_SECONDS: z.coerce.number().int().positive().default(90),
    SETTLEMENT_DELAY_MINUTES: z.coerce.number().int().min(0).default(2),
    SETTLEMENT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
    RECONCILIATION_INTERVAL_SECONDS: z.coerce.number().int().positive().default(3600),
    IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24),
    RATE_LIMIT_CAPACITY: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_REFILL_PER_SEC: z.coerce.number().positive().default(20),
    WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
    WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    ENABLE_DEV_ROUTES: bool.default(true),
    // Free hosting: run the BullMQ workers inside the API process instead of a separate service.
    RUN_WORKERS_IN_API: bool.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENT_PROVIDER === 'razorpay') {
      for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) {
        if (!env[key]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required when PAYMENT_PROVIDER=razorpay` });
        }
      }
    }
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith('change-me')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_SECRET'], message: 'Set a real JWT_SECRET in production' });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = Object.freeze(parsed.data);
