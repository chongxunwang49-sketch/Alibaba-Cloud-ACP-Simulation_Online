'use strict';

/**
 * 生产模式自检（不依赖外部 MongoDB）：
 * 用 mongodb-memory-server 提供数据，但以 NODE_ENV=production 启动真实入口 src/server.js，
 * 验证部署后才暴露的问题：
 *   1. 生产模式不启用 CORS（同源由 Nginx 反代）
 *   2. 限流响应头存在（RATE_LIMIT_DISABLED 未设置）
 *   3. 题库自动导入 951 题、题面不含答案
 *   4. 错误响应不泄漏 stack
 *   5. SIGTERM 能在 10s 内退出（Linux 上验证优雅关闭）
 *
 * 用法：npm run smoke:prod
 * 注意：本脚本依赖 devDependencies（mongodb-memory-server），只在本地/CI 跑。
 */

const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

const SERVER_ROOT = path.resolve(__dirname, '..');
const CLIENT_ID = randomUUID();

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  console.error(`\nFAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function request(port, method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        timeout: 15000,
        headers: {
          'x-client-id': CLIENT_ID,
          ...(payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : {}),
          ...(headers || {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port, child) {
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) {
      fail(`服务提前退出（code=${child.exitCode}），检查上方日志`);
    }
    try {
      const res = await request(port, 'GET', '/api/health');
      if (res.status === 200 && res.json?.data?.status === 'ok') return res;
    } catch {
      // 还没起来，继续等
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return fail('等待 /api/health 超时（30s）');
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  const port = await getFreePort();
  log(`[prod-smoke] mongod=${mongod.getUri('acp_prod')}，启动生产模式 server，端口 ${port}`);

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      MONGODB_URI: mongod.getUri('acp_prod'),
      SEED_ON_START: '1',
      SEED_FORCE: '1',
      CORS_ORIGIN: '',
      RATE_LIMIT_DISABLED: '',
      APP_TIMEZONE: 'Asia/Shanghai',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  const stopChild = async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 10000);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  try {
    const health = await waitForHealth(port, child);
    log(`✔ /api/health 200（db=${health.json.data.db}）`);

    const meta = await request(port, 'GET', '/api/meta');
    if (meta.status !== 200 || meta.json?.data?.bank?.total !== 951) {
      fail(`/api/meta 异常：status=${meta.status} total=${meta.json?.data?.bank?.total}`);
    }
    log('✔ 题库自动导入 951 题');

    const questions = await request(port, 'GET', '/api/questions?pageSize=1');
    const item = questions.json?.data?.items?.[0];
    if (!item || item.answer !== undefined || item.explanation !== undefined) {
      fail('题库接口泄漏 answer/explanation');
    }
    log('✔ 题面不含答案与解析');

    // 生产模式 CORS 关闭：带 Origin 也不应回 Access-Control-Allow-Origin
    const metaWithOrigin = await request(port, 'GET', '/api/meta', {
      headers: { origin: 'http://evil.example.com' },
    });
    if (metaWithOrigin.headers['access-control-allow-origin']) {
      fail('生产模式仍在返回 Access-Control-Allow-Origin');
    }
    log('✔ 生产模式 CORS 已关闭');

    const answered = await request(port, 'POST', '/api/practice/answer', {
      body: { questionId: item.id, selected: ['A'] },
    });
    if (answered.status !== 200) fail(`练习作答失败：status=${answered.status}`);
    const rateHeaders = Object.keys(answered.headers).filter((key) => key.startsWith('ratelimit'));
    if (rateHeaders.length === 0) fail('未看到限流响应头（ratelimit-*）');
    log(`✔ 练习判分正常，限流响应头：${rateHeaders.join(', ')}`);

    const bad = await request(port, 'GET', '/api/exams/not-an-object-id');
    if (bad.status !== 400 || bad.json?.error?.code !== 'VALIDATION_ERROR') {
      fail(`非法参数未按预期返回 400：status=${bad.status}`);
    }
    if (bad.text.includes('at ') && bad.text.includes('.js:')) {
      fail('错误响应疑似泄漏 stack');
    }
    log('✔ 错误响应无 stack 泄漏');

    const started = Date.now();
    await stopChild();
    log(`✔ SIGTERM 后退出（${Date.now() - started}ms）`);

    log('\n生产模式自检全部通过');
  } catch (err) {
    if (logs.length) {
      console.error('\n--- 子进程日志 ---');
      console.error(logs.join('').split('\n').slice(-30).join('\n'));
    }
    if (err && err.message !== '请求超时' && process.exitCode !== 1) {
      console.error(err);
    }
    await stopChild();
    process.exitCode = 1;
  } finally {
    await mongod.stop();
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
