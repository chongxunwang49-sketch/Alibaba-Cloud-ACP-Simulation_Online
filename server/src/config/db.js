'use strict';

const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false);

/**
 * 连接 MongoDB。uri 可选，便于测试用内存实例。
 * 连接失败会抛错，由 server.js 退出交给 PM2 重启。
 */
async function connect(uri = env.mongodbUri) {
  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected');
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    maxPoolSize: 10,
    autoIndex: false, // 索引由启动时的 ensureIndexes 显式创建
  });
  console.log(`[db] connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

async function disconnect() {
  await mongoose.disconnect();
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connect, disconnect, isConnected };
