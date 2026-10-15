// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/**
 * Development helpers. The webhook sink lets the demo work with no external tools:
 * it records deliveries and fails a configurable share of them so retries are visible.
 */
const express = require('express');
const ah = require('../lib/asyncHandler');
const { getRedis } = require('../config/redis');

const router = express.Router();
const KEY = 'dev:webhook-sink';

router.post('/webhook-sink', ah(async (req, res) => {
  const failRate = Math.min(Math.max(Number(req.query.fail_rate || 0), 0), 1);
  const fail = Math.random() < failRate;
  const entry = { at: new Date().toISOString(), event_id: req.get('onyx-event-id'), type: req.body?.type, signature: req.get('onyx-signature'), responded: fail ? 503 : 200 };
  await getRedis().multi().lpush(KEY, JSON.stringify(entry)).ltrim(KEY, 0, 99).exec();
  if (fail) return res.status(503).json({ ok: false, note: 'Simulated outage so you can watch retries' });
  return res.json({ ok: true });
}));

router.get('/webhook-sink', ah(async (req, res) => {
  const rows = await getRedis().lrange(KEY, 0, 49);
  res.json({ data: rows.map((r) => JSON.parse(r)) });
}));

module.exports = router;
