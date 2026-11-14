'use strict';

const router = require('express').Router();
const { isConnected } = require('../config/db');
const pkg = require('../../package.json');

router.get('/', (req, res) => {
  const dbReady = isConnected();
  if (!dbReady) {
    return res.status(503).json({
      error: { code: 'NOT_READY', message: '数据库未连接' },
    });
  }
  return res.json({
    data: {
      status: 'ok',
      db: 'connected',
      version: pkg.version,
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
  });
});

module.exports = router;
