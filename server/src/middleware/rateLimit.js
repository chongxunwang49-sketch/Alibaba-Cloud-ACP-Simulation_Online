'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * 写接口限流。测试环境（NODE_ENV=test 或 RATE_LIMIT_DISABLED=1）自动跳过，
 * 避免用例互相污染。
 */
function createLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.rateLimitDisabled || env.isTest,
    handler: (req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: message || '请求过于频繁，请稍后再试' },
      });
    },
  });
}

const answerLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  message: '答题请求过于频繁，请稍后再试',
});

const examCreateLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  message: '开考请求过于频繁，请稍后再试',
});

const examSubmitLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  message: '交卷请求过于频繁，请稍后再试',
});

module.exports = { createLimiter, answerLimiter, examCreateLimiter, examSubmitLimiter };
