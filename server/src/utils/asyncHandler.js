'use strict';

/** 包装 async 路由，异常交给 Express 错误中间件。 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
