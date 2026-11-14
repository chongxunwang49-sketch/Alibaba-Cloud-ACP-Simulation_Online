'use strict';

const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const env = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

function corsMiddleware() {
  const configured = env.corsOrigin.split(',').map((item) => item.trim()).filter(Boolean);
  const allowAll = configured.includes('*');
  // 本地开发时前端在 5173，生产由 Nginx 同源反代，不需要 CORS。
  const devOrigins = env.isProduction ? [] : ['http://127.0.0.1:5173', 'http://localhost:5173'];
  const allowed = new Set([...configured, ...devOrigins]);

  return function cors(req, res, next) {
    const origin = req.get('origin');
    if (origin && (allowAll || allowed.has(origin))) {
      res.set('Access-Control-Allow-Origin', allowAll ? '*' : origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Client-Id');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));

  if (env.corsOrigin || !env.isProduction) app.use(corsMiddleware());

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
