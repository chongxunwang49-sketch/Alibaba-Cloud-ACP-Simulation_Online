'use strict';

const AnswerRecord = require('../models/AnswerRecord');
const Exam = require('../models/Exam');
const WrongQuestion = require('../models/WrongQuestion');
const { TOPICS } = require('../constants/topics');
const env = require('../config/env');

function pct(correct, total) {
  if (!total) return 0;
  return Number(((correct / total) * 100).toFixed(1));
}

function emptyBucket() {
  return { answered: 0, correct: 0 };
}

async function overview(clientId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [overall, byMode, byTopicRows, examAgg, lastExam, wrongActive, wrongMastered, wrongTopicRows, dailyRows] =
    await Promise.all([
      AnswerRecord.aggregate([
        { $match: { clientId } },
        { $group: { _id: null, answered: { $sum: 1 }, correct: { $sum: { $cond: ['$correct', 1, 0] } } } },
      ]),
      AnswerRecord.aggregate([
        { $match: { clientId } },
        {
          $group: {
            _id: '$mode',
            answered: { $sum: 1 },
            correct: { $sum: { $cond: ['$correct', 1, 0] } },
          },
        },
      ]),
      AnswerRecord.aggregate([
        { $match: { clientId } },
        {
          $group: {
            _id: '$topic',
            answered: { $sum: 1 },
            correct: { $sum: { $cond: ['$correct', 1, 0] } },
          },
        },
      ]),
      Exam.aggregate([
        { $match: { clientId, status: 'submitted' } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgScore: { $avg: '$score' },
            bestScore: { $max: '$score' },
          },
        },
      ]),
      Exam.findOne({ clientId, status: 'submitted' })
        .sort({ submittedAt: -1 })
        .select('score submittedAt durationSec')
        .lean(),
      WrongQuestion.countDocuments({ clientId, mastered: false }),
      WrongQuestion.countDocuments({ clientId, mastered: true }),
      WrongQuestion.aggregate([
        { $match: { clientId, mastered: false } },
        { $group: { _id: '$topic', count: { $sum: 1 } } },
      ]),
      AnswerRecord.aggregate([
        { $match: { clientId, createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: env.timezone } },
            answered: { $sum: 1 },
            correct: { $sum: { $cond: ['$correct', 1, 0] } },
          },
        },
      ]),
    ]);

  const totalRow = overall[0] || { answered: 0, correct: 0 };
  const modeMap = new Map(byMode.map((row) => [row._id, row]));
  const practice = modeMap.get('practice') || { answered: 0, correct: 0 };
  const examMode = modeMap.get('exam') || { answered: 0, correct: 0 };
  const examStats = examAgg[0] || { count: 0, avgScore: 0, bestScore: 0 };

  const topicMap = new Map(byTopicRows.map((row) => [row._id, row]));
  const byTopic = TOPICS.map((topic) => {
    const row = topicMap.get(topic.key) || emptyBucket();
    return {
      topic: topic.key,
      name: topic.name,
      answered: row.answered,
      correct: row.correct,
      accuracy: pct(row.correct, row.answered),
    };
  });

  const wrongTopicMap = new Map(wrongTopicRows.map((row) => [row._id, row.count]));
  const wrongByTopic = TOPICS.map((topic) => ({
    topic: topic.key,
    name: topic.name,
    count: wrongTopicMap.get(topic.key) || 0,
  }));

  const dailyMap = new Map(dailyRows.map((row) => [row._id, row]));
  const last7Days = buildLast7Days(dailyMap);

  return {
    totals: {
      answered: totalRow.answered,
      correct: totalRow.correct,
      accuracy: pct(totalRow.correct, totalRow.answered),
    },
    practice: {
      answered: practice.answered,
      correct: practice.correct,
      accuracy: pct(practice.correct, practice.answered),
    },
    exam: {
      answered: examMode.answered,
      correct: examMode.correct,
      accuracy: pct(examMode.correct, examMode.answered),
    },
    exams: {
      count: examStats.count,
      avgScore: examStats.count ? Number(examStats.avgScore.toFixed(1)) : 0,
      bestScore: examStats.bestScore || 0,
      lastScore: lastExam ? lastExam.score : null,
      lastSubmittedAt: lastExam ? lastExam.submittedAt : null,
    },
    wrongBook: {
      active: wrongActive,
      mastered: wrongMastered,
      byTopic: wrongByTopic,
    },
    byTopic,
    last7Days,
  };
}

/** 以 Asia/Shanghai 为准补齐最近 7 天（含今天），无作答补 0。 */
function buildLast7Days(dailyMap) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const days = [];
  const today = new Date();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today.getTime() - offset * 24 * 3600 * 1000);
    const key = formatter.format(day);
    const row = dailyMap.get(key) || emptyBucket();
    days.push({ date: key, answered: row.answered, correct: row.correct });
  }
  return days;
}

module.exports = { overview };
