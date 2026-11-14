'use strict';

const fs = require('fs');
const path = require('path');
const Question = require('../models/Question');
const User = require('../models/User');
const Exam = require('../models/Exam');
const AnswerRecord = require('../models/AnswerRecord');
const WrongQuestion = require('../models/WrongQuestion');
const env = require('../config/env');

const BANK_FILE = path.join(env.dataDir, 'questions.array.json');
const CHUNK_SIZE = 500;

async function ensureIndexes() {
  await Promise.all([
    Question.createIndexes(),
    User.createIndexes(),
    Exam.createIndexes(),
    AnswerRecord.createIndexes(),
    WrongQuestion.createIndexes(),
  ]);
}

/**
 * 题库自举导入：容器/新机器上没有 mongoimport 也能在首次启动时灌库。
 * 已存在数据时默认跳过；SEED_FORCE=1 时按 _id upsert 覆盖。
 */
async function seedQuestions({ force = false } = {}) {
  const existing = await Question.estimatedDocumentCount();
  if (existing > 0 && !force) {
    return { skipped: true, count: existing };
  }

  if (!fs.existsSync(BANK_FILE)) {
    throw new Error(`题库文件不存在：${BANK_FILE}（先执行 npm run export:bank）`);
  }

  const docs = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
  if (!Array.isArray(docs) || !docs.length) throw new Error('题库文件为空或格式不正确');

  let upserted = 0;
  for (let offset = 0; offset < docs.length; offset += CHUNK_SIZE) {
    const chunk = docs.slice(offset, offset + CHUNK_SIZE);
    const ops = chunk.map((doc) => {
      const { _id, ...rest } = doc;
      return { updateOne: { filter: { _id }, update: { $set: rest }, upsert: true } };
    });
    const result = await Question.bulkWrite(ops, { ordered: false });
    upserted += result.upsertedCount;
  }

  const count = await Question.estimatedDocumentCount();
  console.log(`[seed] questions ready: file=${docs.length} upserted=${upserted} total=${count}`);
  if (count < docs.length) {
    console.warn(`[seed] 警告：库内题目数 ${count} 少于文件 ${docs.length}`);
  }
  return { skipped: false, count };
}

module.exports = { seedQuestions, ensureIndexes, BANK_FILE };
