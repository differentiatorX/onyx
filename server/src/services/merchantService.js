// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { withTransaction } = require('../config/db');
const { Merchant, ApiKey, WebhookEndpoint } = require('../models');
const { randomString } = require('../lib/ids');
const { sha256 } = require('../lib/crypto');
const { conflict, unauthorized } = require('../lib/errors');
const ledger = require('./ledgerService');

function generateSecretKey() {
  const key = `sk_test_${randomString(32)}`;
  return { key, hash: sha256(key), displayPrefix: `${key.slice(0, 12)}…${key.slice(-4)}` };
}

const signToken = (merchant) => jwt.sign({ sub: merchant._id }, env.JWT_SECRET, { expiresIn: env.JWT_TTL });

async function register({ name, email, password }) {
  const exists = await Merchant.exists({ email: email.toLowerCase() });
  if (exists) throw conflict('An account with this email already exists', 'email_taken');
  const passwordHash = await bcrypt.hash(password, 11);
  const secret = generateSecretKey();

  const merchant = await withTransaction(async (session) => {
    const [m] = await Merchant.create([{ name, email, passwordHash }], { session });
    await ledger.ensureAccounts(m._id, session);
    await ApiKey.create([{ merchantId: m._id, hash: secret.hash, displayPrefix: secret.displayPrefix }], { session });
    if (env.ENABLE_DEV_ROUTES) {
      // Out-of-the-box demo: deliveries go to a built-in sink that fails 30% of the time, so retries are visible.
      await WebhookEndpoint.create(
        [{ merchantId: m._id, url: `${env.INTERNAL_API_URL}/dev/webhook-sink?fail_rate=0.3`, secret: `whsec_${randomString(32)}`, events: ['*'], description: 'Built-in test receiver (fails 30% of requests on purpose)' }],
        { session },
      );
    }
    return m;
  });
  return { merchant, apiKey: secret.key, token: signToken(merchant) };
}

async function login({ email, password }) {
  const merchant = await Merchant.findOne({ email: email.toLowerCase() });
  const ok = merchant && (await bcrypt.compare(password, merchant.passwordHash));
  if (!ok) throw unauthorized('Email or password is incorrect');
  return { merchant, token: signToken(merchant) };
}

async function rollApiKey(merchantId) {
  const secret = generateSecretKey();
  await withTransaction(async (session) => {
    await ApiKey.updateMany({ merchantId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
    await ApiKey.create([{ merchantId, hash: secret.hash, displayPrefix: secret.displayPrefix }], { session });
  });
  return secret.key;
}

const listApiKeys = (merchantId) => ApiKey.find({ merchantId }).sort({ createdAt: -1 }).limit(10).lean();

module.exports = { register, login, rollApiKey, listApiKeys, generateSecretKey };
