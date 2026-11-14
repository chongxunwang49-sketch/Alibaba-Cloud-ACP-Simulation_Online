'use strict';

process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.SEED_ON_START = '0';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { connect, disconnect } = require('../src/config/db');
const { createApp } = require('../src/app');
const { seedQuestions, ensureIndexes } = require('../src/services/seedService');
const Question = require('../src/models/Question');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

let mongod;
let app;
let bankCount = 0;

function api() {
  return request(app);
}

function as(req, clientId = CLIENT_ID) {
  return req.set('X-Client-Id', clientId);
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connect(mongod.getUri('acp_test'));
  const seeded = await seedQuestions({ force: true });
  bankCount = seeded.count;
  await ensureIndexes();
  app = createApp();
}, { timeout: 240000 });

after(async () => {
  await disconnect();
  if (mongod) await mongod.stop();
});

test('health 与 404', async () => {
  const res = await api().get('/api/health').expect(200);
  assert.equal(res.body.data.status, 'ok');
  assert.equal(res.body.data.db, 'connected');

  const missing = await api().get('/api/not-exists').expect(404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
});

test('meta 返回板块、题型与题库规模', async () => {
  const res = await api().get('/api/meta').expect(200);
  const { data } = res.body;
  assert.equal(data.topics.length, 6);
  assert.equal(data.topics.reduce((sum, t) => sum + t.ratio, 0), 100);
  assert.equal(data.exam.total, 75);
  assert.equal(data.exam.single, 50);
  assert.equal(data.exam.multiple, 25);
  assert.equal(data.exam.maxScore, 100);
  assert.equal(data.bank.total, bankCount);
  assert.equal(data.bank.single + data.bank.multiple, bankCount);
});

test('题库分页不下发答案，支持过滤与关键词', async () => {
  const res = await api().get('/api/questions?page=1&pageSize=10').expect(200);
  const { items, total, totalPages } = res.body.data;
  assert.equal(items.length, 10);
  assert.equal(total, bankCount);
  assert.ok(totalPages >= 1);
  for (const item of items) {
    assert.ok(item.id);
    assert.ok(item.question);
    assert.ok(Array.isArray(item.options));
    assert.equal(item.answer, undefined);
    assert.equal(item.explanation, undefined);
  }

  const filtered = await api().get('/api/questions?topic=rag&type=single&pageSize=5').expect(200);
  assert.ok(filtered.body.data.total > 0);
  for (const item of filtered.body.data.items) {
    assert.equal(item.topic, 'rag');
    assert.equal(item.type, 'single');
  }

  const keyword = await api().get(`/api/questions?keyword=${encodeURIComponent('大模型')}&pageSize=5`).expect(200);
  assert.ok(keyword.body.data.total > 0);

  const invalid = await api().get('/api/questions?type=judge').expect(400);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

  const detail = await api().get(`/api/questions/${items[0].id}`).expect(200);
  assert.equal(detail.body.data.id, items[0].id);
  assert.equal(detail.body.data.answer, undefined);
});

test('练习卷随机抽题且不含答案', async () => {
  const res = await api().get('/api/practice/set?count=5&type=multiple').expect(200);
  assert.equal(res.body.data.items.length, 5);
  for (const item of res.body.data.items) {
    assert.equal(item.type, 'multiple');
    assert.equal(item.answer, undefined);
  }

  const capped = await api().get('/api/practice/set?count=999').expect(400);
  assert.equal(capped.body.error.code, 'VALIDATION_ERROR');
});

test('身份校验：缺失 401、非法 400、http 降级设备串可用', async () => {
  const missing = await api().get('/api/stats/overview').expect(401);
  assert.equal(missing.body.error.code, 'CLIENT_ID_REQUIRED');

  const invalid = await api().get('/api/stats/overview').set('X-Client-Id', 'abc').expect(400);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

  // 非安全上下文没有 crypto.randomUUID()，前端降级为 c-<时间戳>-<随机串>
  const fallback = await as(api().get('/api/stats/overview'), 'c-1750000000000-abc123').expect(200);
  assert.equal(fallback.body.data.totals.answered, 0);
});

test('练习作答：判分、解析、错题本写入与已掌握切换', async () => {
  const wrongTarget = await Question.findOne({ type: 'single' }).lean();
  const wrongLetter = ['A', 'B', 'C', 'D'].find((letter) => !wrongTarget.answer.includes(letter));

  const wrongRes = await as(api().post('/api/practice/answer')).send({
    questionId: wrongTarget._id,
    selected: [wrongLetter],
  }).expect(200);
  assert.equal(wrongRes.body.data.correct, false);
  assert.deepEqual(wrongRes.body.data.answer, wrongTarget.answer);
  assert.ok(wrongRes.body.data.explanation !== undefined);

  const list = await as(api().get('/api/wrong-questions')).expect(200);
  assert.equal(list.body.data.total, 1);
  const entry = list.body.data.items[0];
  assert.equal(entry.questionId, wrongTarget._id);
  assert.equal(entry.wrongCount, 1);
  assert.equal(entry.mastered, false);
  assert.equal(entry.answer, undefined);

  const detail = await as(api().get(`/api/wrong-questions/${wrongTarget._id}`)).expect(200);
  assert.deepEqual(detail.body.data.answer, wrongTarget.answer);

  const patched = await as(api().patch(`/api/wrong-questions/${wrongTarget._id}`))
    .send({ mastered: true })
    .expect(200);
  assert.equal(patched.body.data.mastered, true);

  const masteredOnly = await as(api().get('/api/wrong-questions?mastered=true')).expect(200);
  assert.equal(masteredOnly.body.data.total, 1);

  const badPatch = await as(api().patch(`/api/wrong-questions/${wrongTarget._id}`))
    .send({ mastered: 'yes' })
    .expect(400);
  assert.equal(badPatch.body.error.code, 'VALIDATION_ERROR');

  // 再次答错：wrongCount 累加，但 mastered 保持用户手动状态（不自动重置）。
  const again = await as(api().post('/api/practice/answer')).send({
    questionId: wrongTarget._id,
    selected: [wrongLetter],
  }).expect(200);
  assert.equal(again.body.data.correct, false);
  const listAgain = await as(api().get('/api/wrong-questions?mastered=true')).expect(200);
  assert.equal(listAgain.body.data.items[0].wrongCount, 2);

  const removed = await as(api().delete(`/api/wrong-questions/${wrongTarget._id}`)).expect(200);
  assert.equal(removed.body.data.deleted, true);
  await as(api().get(`/api/wrong-questions/${wrongTarget._id}`)).expect(404);

  const okTarget = await Question.findOne({ type: 'multiple' }).lean();
  const okRes = await as(api().post('/api/practice/answer')).send({
    questionId: okTarget._id,
    selected: okTarget.answer,
  }).expect(200);
  assert.equal(okRes.body.data.correct, true);

  const badLetters = await as(api().post('/api/practice/answer')).send({
    questionId: okTarget._id,
    selected: ['Z'],
  }).expect(400);
  assert.equal(badLetters.body.error.code, 'VALIDATION_ERROR');
});

let examId;
let examPaper = [];
let submittedSummary;

test('开考：50 单选 + 25 多选，覆盖六大板块，不泄露答案', async () => {
  const res = await as(api().post('/api/exams')).expect(201);
  examId = res.body.data.id;
  assert.equal(res.body.data.total, 75);
  assert.equal(res.body.data.maxScore, 100);
  assert.equal(res.body.data.status, 'ongoing');
  assert.equal(res.body.data.resumed, false);

  const detail = await as(api().get(`/api/exams/${examId}`)).expect(200);
  examPaper = detail.body.data.paper;
  assert.equal(examPaper.length, 75);
  assert.equal(examPaper.filter((item) => item.type === 'single').length, 50);
  assert.equal(examPaper.filter((item) => item.type === 'multiple').length, 25);
  assert.equal(new Set(examPaper.map((item) => item.id)).size, 75);

  const topics = new Set(examPaper.map((item) => item.topic));
  assert.equal(topics.size, 6);
  for (const item of examPaper) {
    assert.equal(item.answer, undefined);
    assert.equal(item.explanation, undefined);
    assert.equal(item.correct, null);
  }
});

test('重复开考返回同一张进行中试卷', async () => {
  const res = await as(api().post('/api/exams')).expect(200);
  assert.equal(res.body.data.id, examId);
  assert.equal(res.body.data.resumed, true);
});

test('交卷判分：得分、对错数、板块统计正确且幂等', async () => {
  const questions = await Question.find({ _id: { $in: examPaper.map((item) => item.id) } })
    .select('answer options')
    .lean();
  const qMap = new Map(questions.map((q) => [q._id, q]));
  const paperMap = new Map(examPaper.map((item) => [item.id, item]));

  const answers = [];
  let expectedScore = 0;
  let expectedCorrect = 0;

  // 前 10 题答对，接着 5 题答错，其余留空。
  examPaper.slice(0, 10).forEach((item) => {
    const q = qMap.get(item.id);
    answers.push({ questionId: item.id, selected: q.answer });
    expectedScore += item.points;
    expectedCorrect += 1;
  });
  examPaper.slice(10, 15).forEach((item) => {
    const q = qMap.get(item.id);
    const wrong = ['A', 'B', 'C', 'D', 'E', 'F']
      .filter((letter) => !q.answer.includes(letter))
      .slice(0, 1);
    answers.push({ questionId: item.id, selected: wrong });
  });

  assert.ok(answers.every((item) => paperMap.has(item.questionId)));

  const res = await as(api().post(`/api/exams/${examId}/submit`))
    .send({ answers, durationSec: 600 })
    .expect(200);
  const summary = res.body.data;
  submittedSummary = summary;
  assert.equal(summary.score, expectedScore);
  assert.equal(summary.correctCount, expectedCorrect);
  assert.equal(summary.wrongCount, 5);
  assert.equal(summary.unansweredCount, 60);
  assert.equal(summary.maxScore, 100);
  assert.equal(summary.status, 'submitted');
  assert.equal(summary.alreadySubmitted, false);
  assert.equal(summary.byTopic.length, 6);
  assert.equal(summary.byTopic.reduce((sum, t) => sum + t.total, 0), 75);
  assert.equal(summary.byTopic.reduce((sum, t) => sum + t.correct, 0), expectedCorrect);

  // 幂等：重复交卷不再判分、不重复累计错题
  const again = await as(api().post(`/api/exams/${examId}/submit`))
    .send({ answers, durationSec: 900 })
    .expect(200);
  assert.equal(again.body.data.alreadySubmitted, true);
  assert.equal(again.body.data.score, expectedScore);
  assert.equal(again.body.data.durationSec, 600);

  const wrongQuestions = await as(api().get('/api/wrong-questions?pageSize=50')).expect(200);
  assert.equal(wrongQuestions.body.data.total, 5);
  assert.ok(wrongQuestions.body.data.items.every((item) => item.wrongCount === 1));
});

test('成绩报告含答案与解析，未交卷不可看', async () => {
  const res = await as(api().get(`/api/exams/${examId}/report`)).expect(200);
  assert.equal(res.body.data.items.length, 75);
  for (const item of res.body.data.items) {
    assert.ok(Array.isArray(item.answer));
    assert.ok(item.answer.length >= 1);
    assert.equal(typeof item.correct, 'boolean');
  }
  assert.equal(res.body.data.items[0].selected.length >= 1, true);

  // 新开一张卷，未交卷请求报告 -> 409
  const ongoing = await as(api().post('/api/exams')).expect(201);
  const conflict = await as(api().get(`/api/exams/${ongoing.body.data.id}/report`)).expect(409);
  assert.equal(conflict.body.error.code, 'EXAM_NOT_SUBMITTED');
});

test('考试历史与统计概览', async () => {
  const list = await as(api().get('/api/exams?status=submitted')).expect(200);
  assert.equal(list.body.data.total, 1);
  assert.equal(list.body.data.items[0].id, examId);

  const stats = await as(api().get('/api/stats/overview')).expect(200);
  const { data } = stats.body;
  // 练习 3 次作答 + 考试实际作答 15 题（未作答不写流水）
  assert.equal(data.totals.answered, 18);
  assert.equal(data.practice.answered, 3);
  assert.equal(data.exam.answered, 15);
  assert.equal(data.exams.count, 1);
  assert.equal(data.exams.lastScore, submittedSummary.score);
  assert.equal(data.wrongBook.active, 5);
  assert.equal(data.byTopic.length, 6);
  assert.equal(data.last7Days.length, 7);
  const today = data.last7Days[6];
  assert.equal(today.date.length, 10);
  assert.ok(today.answered > 0);
});

test('越权与非法参数防护', async () => {
  const other = await as(api().get(`/api/exams/${examId}`), OTHER_ID).expect(404);
  assert.equal(other.body.error.code, 'NOT_FOUND');

  const otherExam = await as(api().post('/api/exams'), OTHER_ID).expect(201);
  const notInPaper = await as(api().post(`/api/exams/${otherExam.body.data.id}/submit`), OTHER_ID)
    .send({ answers: [{ questionId: 'q-not-in-paper', selected: ['A'] }] })
    .expect(400);
  assert.equal(notInPaper.body.error.code, 'VALIDATION_ERROR');

  const badId = await as(api().get('/api/exams/not-an-object-id')).expect(400);
  assert.equal(badId.body.error.code, 'VALIDATION_ERROR');
});

test('整卷全对：满分 100、板块满分、报告逐题正确、不新增错题', async () => {
  // 复用上一用例创建的进行中试卷
  const resumed = await as(api().post('/api/exams')).expect(200);
  assert.equal(resumed.body.data.resumed, true);
  const id = resumed.body.data.id;

  const detail = await as(api().get(`/api/exams/${id}`)).expect(200);
  const paper = detail.body.data.paper;
  assert.equal(paper.length, 75);
  assert.equal(paper.filter((item) => item.type === 'single').length, 50);
  assert.equal(paper.filter((item) => item.type === 'multiple').length, 25);

  const ids = paper.map((item) => item.id);
  const questions = await Question.find({ _id: { $in: ids } }).select('answer').lean();
  const answerMap = new Map(questions.map((q) => [q._id, q.answer]));
  const answers = ids.map((qid) => ({ questionId: qid, selected: answerMap.get(qid) }));

  const res = await as(api().post(`/api/exams/${id}/submit`))
    .send({ answers, durationSec: 1500 })
    .expect(200);
  const summary = res.body.data;
  assert.equal(summary.score, 100);
  assert.equal(summary.correctCount, 75);
  assert.equal(summary.wrongCount, 0);
  assert.equal(summary.unansweredCount, 0);
  assert.equal(summary.durationSec, 1500);
  assert.equal(summary.byTopic.length, 6);
  for (const topic of summary.byTopic) {
    assert.equal(topic.correct, topic.total);
    assert.equal(topic.score, topic.maxScore);
  }
  assert.equal(summary.byTopic.reduce((sum, t) => sum + t.score, 0), 100);

  const report = await as(api().get(`/api/exams/${id}/report`)).expect(200);
  assert.equal(report.body.data.items.length, 75);
  assert.ok(report.body.data.items.every((item) => item.correct === true));

  // 全对不应新增错题（此前累计 5 道）
  const wrong = await as(api().get('/api/wrong-questions?pageSize=50')).expect(200);
  assert.equal(wrong.body.data.total, 5);
});
