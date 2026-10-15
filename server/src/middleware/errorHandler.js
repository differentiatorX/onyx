// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const logger = require('../config/logger');
const { AppError } = require('../lib/errors');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
  }
  if (err.name === 'LedgerError') {
    logger.error({ err, requestId: req.id }, 'Ledger invariant violated');
  } else {
    logger.error({ err, requestId: req.id }, 'Unhandled error');
  }
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong on our side. Retrying with the same Idempotency-Key is safe.', request_id: req.id },
  });
};
