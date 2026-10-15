// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const pino = require('pino');
const env = require('./env');

module.exports = pino({
  level: env.LOG_LEVEL,
  base: { service: process.env.SERVICE_NAME || 'onyx-api' },
  redact: ['req.headers.authorization', 'req.headers["x-razorpay-signature"]', 'req.headers["x-mockbank-signature"]'],
});
