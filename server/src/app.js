// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');
const mongoose = require('mongoose');
const env = require('./config/env');
const logger = require('./config/logger');
const { getRedis } = require('./config/redis');
const { newId } = require('./lib/ids');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || newId('req', 12);
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  // Provider webhooks need the raw body, so they are mounted before the JSON parser.
  app.use('/webhooks', require('./routes/providerWebhooks'));
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (req, res) => res.json({ name: 'Onyx API', version: '1.0.0', author: 'differentiatorX <madhur.m2006@gmail.com>', source: 'https://github.com/differentiatorX/onyx' }));

  app.get('/health', async (req, res) => {
    const mongo = mongoose.connection.readyState === 1;
    const redis = await getRedis()
      .ping()
      .then(() => true)
      .catch(() => false);
    res.status(mongo && redis ? 200 : 503).json({ ok: mongo && redis, mongo, redis });
  });

  app.use('/v1', require('./routes/v1'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/checkout', require('./routes/checkout'));
  if (env.ENABLE_DEV_ROUTES) app.use('/dev', require('./routes/dev'));

  app.use((req, res) => res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
