'use strict';

const env = require('../config/env');
const { ApiError } = require('../utils/errors');

function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `接口不存在：${req.method} ${req.originalUrl}` },
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = '服务器内部错误';

  if (err instanceof ApiError) {
    status = err.status;
    code = err.code;
    message = err.message;
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = '请求体不是合法的 JSON';
  } else if (err && err.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = '请求体过大';
  } else if (err && err.name === 'CastError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = `参数格式不正确：${err.path}`;
  } else if (err && err.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = Object.values(err.errors || {})
      .map((item) => item.message)
      .join('；') || '参数校验失败';
  } else if (err && err.code === 11000) {
    status = 409;
    code = 'DUPLICATE_KEY';
    message = '数据已存在';
  }

  if (status >= 500) {
    console.error('[error]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  }

  const body = { error: { code, message } };
  if (!env.isProduction && err && err.stack && status >= 500) body.error.stack = err.stack;
  res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
