'use strict';

const env = require('./config/env');
const { connect, disconnect } = require('./config/db');
const { createApp } = require('./app');
const { seedQuestions, ensureIndexes } = require('./services/seedService');

let server = null;
let shuttingDown = false;
let memoryServer = null;

/** 本地没有 mongod 时可开内存实例（npm run dev:memory），生产永不启用。 */
async function resolveMongoUri() {
  if (!env.isProduction && process.env.USE_MEMORY_DB === '1') {
    // 延迟 require，生产环境不安装 devDependencies 也不会报错。
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    console.log('[db] using in-memory mongod (dev only)');
    return memoryServer.getUri('acp');
  }
  return env.mongodbUri;
}

async function bootstrap() {
  await connect(await resolveMongoUri());

  if (env.seedOnStart) {
    const result = await seedQuestions({ force: env.seedForce });
    console.log(`[seed] ${result.skipped ? 'skipped（题库已存在）' : 'done'}，questions=${result.count}`);
  }
  await ensureIndexes();

  const app = createApp();
  server = app.listen(env.port, env.host, () => {
    console.log(`[server] listening on http://${env.host}:${env.port} (${env.nodeEnv})`);
  });

  // 比 Nginx 的 keepalive 略长，避免上游空闲连接被提前关闭导致偶发 502。
  server.keepAliveTimeout = 65 * 1000;
  server.headersTimeout = 66 * 1000;
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down...`);

  const forceTimer = setTimeout(() => {
    console.error('[server] graceful shutdown timeout, force exit');
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnect();
  if (memoryServer) await memoryServer.stop();
  clearTimeout(forceTimer);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
  process.exit(1);
});

bootstrap().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
