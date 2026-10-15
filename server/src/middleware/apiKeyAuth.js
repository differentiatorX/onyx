// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const asyncHandler = require('../lib/asyncHandler');
const { ApiKey, Merchant } = require('../models');
const { sha256 } = require('../lib/crypto');
const { unauthorized } = require('../lib/errors');

function extractKey(req) {
  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (header.startsWith('Basic ')) return Buffer.from(header.slice(6), 'base64').toString().split(':')[0];
  return null;
}

/** Merchant API auth: secret key as Bearer token (or Basic auth username, like Stripe). */
module.exports = asyncHandler(async (req, res, next) => {
  const token = extractKey(req);
  if (!token || !token.startsWith('sk_')) throw unauthorized('Send your secret key as "Authorization: Bearer sk_test_..."');
  const key = await ApiKey.findOne({ hash: sha256(token), revokedAt: null }).lean();
  if (!key) throw unauthorized('This API key is invalid or has been rolled');
  const merchant = await Merchant.findById(key.merchantId).lean();
  if (!merchant) throw unauthorized('This API key is invalid or has been rolled');
  req.merchant = merchant;
  req.apiKeyId = key._id;
  ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  next();
});
