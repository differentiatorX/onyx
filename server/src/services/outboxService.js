// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { OutboxEvent } = require('../models');

/** Must be called with the same session as the state change it describes. */
async function enqueue({ merchantId, type, objectId, data, session }) {
  const [event] = await OutboxEvent.create([{ merchantId, type, objectId, data }], session ? { session } : {});
  return event;
}

module.exports = { enqueue };
