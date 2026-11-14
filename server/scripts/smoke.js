'use strict';

/**
 * 部署后冒烟：只通过 HTTP 验证核心读写链路。
 * 用法：SMOKE_BASE_URL=http://127.0.0.1:3004 npm run smoke
 */
const http = require('http');
const { randomUUID } = require('crypto');

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3004';
const CLIENT_ID = randomUUID();
let passed = 0;

function request(method, path, { body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = { 'x-client-id': CLIENT_ID };
    if (data) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(data);
    }
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
        timeout: 15000,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch (err) {
            parsed = null;
          }
          resolve({ status: res.statusCode, body: parsed, text });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`请求超时：${method} ${path}`)));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function check(name, condition, detail) {
  if (!condition) {
    throw new Error(`✖ ${name}${detail ? `：${detail}` : ''}`);
  }
  passed += 1;
  console.log(`✔ ${name}`);
}

async function main() {
  console.log(`smoke against ${BASE}（clientId=${CLIENT_ID}）`);

  const health = await request('GET', '/api/health');
  check('GET /api/health', health.status === 200 && health.body.data.status === 'ok', `status=${health.status}`);

  const meta = await request('GET', '/api/meta');
  check('GET /api/meta', meta.status === 200 && meta.body.data.bank.total > 0);
  check('题库 951 题已导入', meta.body.data.bank.total === 951, `total=${meta.body.data.bank.total}`);

  const questions = await request('GET', '/api/questions?pageSize=3');
  check(
    'GET /api/questions 不下发答案',
    questions.status === 200 && questions.body.data.items.every((item) => item.answer === undefined)
  );

  const practice = await request('GET', '/api/practice/set?count=2');
  check('GET /api/practice/set', practice.status === 200 && practice.body.data.items.length === 2);

  const created = await request('POST', '/api/exams');
  check('POST /api/exams', [200, 201].includes(created.status), `status=${created.status}`);
  const examId = created.body.data.id;

  const detail = await request('GET', `/api/exams/${examId}`);
  check('GET /api/exams/:id', detail.status === 200 && detail.body.data.paper.length === 75);

  const submitted = await request('POST', `/api/exams/${examId}/submit`, { body: { answers: [] } });
  check(
    'POST /api/exams/:id/submit',
    submitted.status === 200 && submitted.body.data.unansweredCount === 75 && submitted.body.data.score === 0
  );

  const report = await request('GET', `/api/exams/${examId}/report`);
  check('GET /api/exams/:id/report', report.status === 200 && report.body.data.items.length === 75);

  const stats = await request('GET', '/api/stats/overview');
  check('GET /api/stats/overview', stats.status === 200 && stats.body.data.last7Days.length === 7);

  const wrong = await request('GET', '/api/wrong-questions');
  check('GET /api/wrong-questions', wrong.status === 200);

  console.log(`\n全部通过：${passed} 项`);
}

main().catch((err) => {
  console.error(`\n冒烟失败：${err.message}`);
  process.exit(1);
});
