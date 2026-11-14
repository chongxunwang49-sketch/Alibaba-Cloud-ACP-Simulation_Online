'use strict';

const Question = require('../models/Question');
const { TOPICS } = require('../constants/topics');

const TOPIC_NAME = new Map(TOPICS.map((t) => [t.key, t.name]));

function topicName(key) {
  return TOPIC_NAME.get(key) || key;
}

/** 练习/考试中下发：绝不包含正确答案与解析；来源属于题面元数据，可以下发。 */
function toPublic(doc) {
  return {
    id: doc._id,
    type: doc.type,
    topic: doc.topic,
    topicName: topicName(doc.topic),
    question: doc.question,
    options: doc.options,
    source: doc.source || '',
    sourceUrl: doc.sourceUrl || '',
  };
}

/** 提交答案/复盘时下发：含答案与解析。 */
function toReview(doc) {
  return {
    ...toPublic(doc),
    answer: doc.answer,
    explanation: doc.explanation || '',
  };
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function groupByTopic(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.topic)) map.set(row.topic, []);
    map.get(row.topic).push(row._id);
  }
  return map;
}

/** 最大余额法：把按比例的小数配额凑成整数，且总和精确等于 count。 */
function allocateQuota(count, ratios) {
  const raw = ratios.map((ratio) => ratio * count);
  const base = raw.map(Math.floor);
  let rest = count - base.reduce((sum, n) => sum + n, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - base[index] }))
    .sort((a, b) => b.frac - a.frac);
  let cursor = 0;
  while (rest > 0) {
    base[order[cursor % order.length].index] += 1;
    cursor += 1;
    rest -= 1;
  }
  return base;
}

/**
 * 按考纲板块比例抽一套试卷：每种题型内部按 17/15/20/16/16/16 分配名额，
 * 某板块题量不足时用同题型其他板块补齐，保证总题数不变。
 */
async function pickExamPaper(blueprint) {
  const items = [];
  for (const [type, count] of Object.entries(blueprint)) {
    const rows = await Question.find({ type }).select('_id topic').lean();
    if (rows.length < count) {
      const err = new Error(`题库中 ${type} 题不足：需要 ${count}，实际 ${rows.length}`);
      err.code = 'BANK_INSUFFICIENT';
      throw err;
    }

    const pools = groupByTopic(rows);
    const ratios = TOPICS.map((t) => t.ratio / 100);
    const quotas = allocateQuota(count, ratios);
    const picked = [];
    const used = new Set();
    const leftovers = [];

    TOPICS.forEach((topic, index) => {
      const pool = shuffle(pools.get(topic.key) || []);
      const quota = quotas[index];
      const take = Math.min(quota, pool.length);
      for (let i = 0; i < take; i += 1) {
        picked.push({ questionId: pool[i], type, topic: topic.key });
        used.add(pool[i]);
      }
      for (let i = take; i < pool.length; i += 1) {
        leftovers.push({ questionId: pool[i], type, topic: topic.key });
      }
    });

    // 名额不足的板块，从其他板块剩余题目中随机补齐（仍保持该题型总量）。
    if (picked.length < count) {
      for (const item of shuffle(leftovers)) {
        if (picked.length >= count) break;
        if (used.has(item.questionId)) continue;
        picked.push(item);
        used.add(item.questionId);
      }
    }
    if (picked.length !== count) {
      const err = new Error(`组卷失败：${type} 仅能抽到 ${picked.length}/${count} 题`);
      err.code = 'BANK_INSUFFICIENT';
      throw err;
    }

    for (const item of shuffle(picked)) items.push(item);
  }

  return items.map((item, index) => ({
    ...item,
    points: item.type === 'single' ? 1 : 2,
    order: index + 1,
  }));
}

/** 题库规模统计（1 分钟缓存），供 /api/meta 与前端首屏展示。 */
let bankCache = null;
let bankCacheAt = 0;

async function getBankStats() {
  if (bankCache && Date.now() - bankCacheAt < 60 * 1000) return bankCache;

  const rows = await Question.aggregate([
    { $group: { _id: { topic: '$topic', type: '$type' }, count: { $sum: 1 } } },
  ]);
  const byTopic = TOPICS.map((topic) => ({ topic: topic.key, name: topic.name, total: 0, single: 0, multiple: 0 }));
  const topicMap = new Map(byTopic.map((item) => [item.topic, item]));
  let total = 0;

  for (const row of rows) {
    const item = topicMap.get(row._id.topic);
    if (!item) continue;
    item.total += row.count;
    if (row._id.type === 'single') item.single += row.count;
    if (row._id.type === 'multiple') item.multiple += row.count;
    total += row.count;
  }

  const single = byTopic.reduce((sum, item) => sum + item.single, 0);
  const multiple = byTopic.reduce((sum, item) => sum + item.multiple, 0);
  const explained = await Question.countDocuments({ explanation: { $nin: ['', null] } });
  bankCache = { total, single, multiple, explained, byTopic };
  bankCacheAt = Date.now();
  return bankCache;
}

module.exports = {
  topicName,
  toPublic,
  toReview,
  shuffle,
  allocateQuota,
  pickExamPaper,
  getBankStats,
};
