// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const asyncHandler = require('../lib/asyncHandler');
const { Merchant } = require('../models');
const { unauthorized } = require('../lib/errors');

/** Dashboard auth. */
module.exports = asyncHandler(async (req, res, next) => {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw unauthorized('Sign in to continue');
  let payload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET);
  } catch {
    throw unauthorized('Your session has expired; sign in again');
  }
  const merchant = await Merchant.findById(payload.sub).lean();
  if (!merchant) throw unauthorized('Account not found');
  req.merchant = merchant;
  next();
});
