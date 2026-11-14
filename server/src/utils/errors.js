'use strict';

/**
 * 业务异常：最终由 errorHandler 统一转成
 * { error: { code, message } }，HTTP 状态码取 status。
 */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const badRequest = (message, code = 'VALIDATION_ERROR') => new ApiError(400, code, message);
const unauthorized = (message, code = 'CLIENT_ID_REQUIRED') => new ApiError(401, code, message);
const notFound = (message = '资源不存在', code = 'NOT_FOUND') => new ApiError(404, code, message);
const conflict = (message, code = 'CONFLICT') => new ApiError(409, code, message);
const tooMany = (message = '请求过于频繁', code = 'RATE_LIMITED') => new ApiError(429, code, message);
const notReady = (message = '服务未就绪', code = 'NOT_READY') => new ApiError(503, code, message);

module.exports = {
  ApiError,
  badRequest,
  unauthorized,
  notFound,
  conflict,
  tooMany,
  notReady,
};
