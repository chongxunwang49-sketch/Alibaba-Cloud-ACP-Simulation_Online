'use strict';

const User = require('../models/User');
const { badRequest, unauthorized } = require('../utils/errors');

// 设备标识：标准 uuid v4，或前端降级生成的 8–64 位安全字符串。
// 注意 http://IP 属于非安全上下文，浏览器没有 crypto.randomUUID()，前端会退化为 c-<时间戳>-<随机串>。
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9][A-Za-z0-9_-]{7,63})$/i;

// 每个进程内对 lastSeenAt 做 5 分钟节流，避免每个请求都写库。
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const TOUCH_CACHE_MAX = 5000;
const lastTouched = new Map();

function readClientId(req) {
  const raw = req.get('x-client-id');
  if (!raw || !raw.trim()) return null;
  const value = raw.trim();
  if (!CLIENT_ID_RE.test(value)) {
    throw badRequest('X-Client-Id 格式不合法（uuid v4 或 8–64 位设备串）', 'VALIDATION_ERROR');
  }
  return value;
}

async function touchUser(clientId) {
  const now = Date.now();
  const last = lastTouched.get(clientId);
  if (last && now - last < TOUCH_INTERVAL_MS) return;

  if (lastTouched.size >= TOUCH_CACHE_MAX) lastTouched.clear();
  lastTouched.set(clientId, now);

  try {
    await User.updateOne(
      { _id: clientId },
      { $set: { lastSeenAt: new Date(now) }, $setOnInsert: { nickname: null } },
      { upsert: true }
    );
  } catch (err) {
    // 并发 upsert 可能触发 _id 唯一键冲突，忽略即可（用户已存在）。
    if (err && err.code !== 11000) throw err;
  }
}

function optionalClientId(req, res, next) {
  try {
    req.clientId = readClientId(req);
    next();
  } catch (err) {
    next(err);
  }
}

async function requireClientId(req, res, next) {
  try {
    const clientId = readClientId(req);
    if (!clientId) {
      throw unauthorized('缺少 X-Client-Id 请求头', 'CLIENT_ID_REQUIRED');
    }
    req.clientId = clientId;
    await touchUser(clientId);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { optionalClientId, requireClientId, UUID_V4_RE, CLIENT_ID_RE };
