'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const SERVER_ROOT = path.resolve(__dirname, '../..');
const ENV_FILE = path.join(SERVER_ROOT, '.env');

// 显式加载 server/.env，不依赖启动时的工作目录；已存在的环境变量优先。
if (fs.existsSync(ENV_FILE)) {
  dotenv.config({ path: ENV_FILE });
}

function toInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) {
    throw new Error(`环境变量 ${name} 必须是整数，当前值：${raw}`);
  }
  return value;
}

function toBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt('PORT', 3004),
  host: process.env.HOST || '0.0.0.0',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acp',
  trustProxy: toBool('TRUST_PROXY', false),
  seedOnStart: toBool('SEED_ON_START', true),
  seedForce: toBool('SEED_FORCE', false),
  corsOrigin: process.env.CORS_ORIGIN || '',
  timezone: process.env.APP_TIMEZONE || 'Asia/Shanghai',
  rateLimitDisabled: toBool('RATE_LIMIT_DISABLED', false),
  serverRoot: SERVER_ROOT,
  dataDir: path.join(SERVER_ROOT, 'data'),
};

env.isTest = env.nodeEnv === 'test';
env.isProduction = env.nodeEnv === 'production';

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error(`PORT 非法：${env.port}`);
}

module.exports = env;
