'use strict';

const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const AnswerRecord = require('../models/AnswerRecord');
const WrongQuestion = require('../models/WrongQuestion');
const { TOPICS, EXAM_BLUEPRINT } = require('../constants/topics');
const { badRequest, conflict, notFound } = require('../utils/errors');
const { normalizeLetters } = require('../utils/validate');
const { pickExamPaper, toPublic, toReview, topicName } = require('./questionService');

const TOPIC_ORDER = TOPICS.map((t) => t.key);

function examSummary(exam) {
  return {
    id: String(exam._id),
    status: exam.status,
    total: exam.paper.length,
    startedAt: exam.startedAt,
    submittedAt: exam.submittedAt,
    durationSec: exam.durationSec,
    score: exam.score,
    maxScore: exam.maxScore,
    correctCount: exam.correctCount,
    wrongCount: exam.wrongCount,
    unansweredCount: exam.unansweredCount,
    byTopic: (exam.byTopic || []).map((t) => ({
      topic: t.topic,
      name: t.name,
      total: t.total,
      correct: t.correct,
      score: t.score,
      maxScore: t.maxScore,
    })),
  };
}

function assertExamId(id) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('考试 id 格式不正确');
}

/**
 * 开考：若已有进行中的试卷则直接返回（支持刷新/断点续考），
 * 否则按蓝图抽新卷。返回 resumed 标记便于前端提示。
 */
async function createExam(clientId) {
  const ongoing = await Exam.findOne({ clientId, status: 'ongoing' }).sort({ startedAt: -1 });
  if (ongoing) {
    return { exam: ongoing, resumed: true };
  }

  const paper = await pickExamPaper(EXAM_BLUEPRINT);
  const maxScore = paper.reduce((sum, item) => sum + item.points, 0);
  const exam = await Exam.create({
    clientId,
    status: 'ongoing',
    paper,
    startedAt: new Date(),
    maxScore,
  });
  return { exam, resumed: false };
}

/** 试卷详情：进行中给题面；已交卷额外给每题对错，但不含答案/解析。 */
async function getExamDetail(clientId, examId) {
  assertExamId(examId);
  const exam = await Exam.findOne({ _id: examId, clientId });
  if (!exam) throw notFound('考试不存在');

  const ids = exam.paper.map((p) => p.questionId);
  const questions = await Question.find({ _id: { $in: ids } }).lean();
  const qMap = new Map(questions.map((q) => [q._id, q]));
  const answerMap = new Map((exam.answers || []).map((a) => [a.questionId, a]));

  const paper = exam.paper
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const q = qMap.get(item.questionId);
      const answer = answerMap.get(item.questionId);
      return {
        order: item.order,
        points: item.points,
        ...(q
          ? toPublic(q)
          : {
              id: item.questionId,
              type: item.type,
              topic: item.topic,
              topicName: topicName(item.topic),
              question: '（题目已下线）',
              options: [],
            }),
        selected: answer ? answer.selected : [],
        correct: exam.status === 'submitted' && answer ? answer.correct : null,
      };
    });

  return { ...examSummary(exam), paper };
}

/** 交卷判分：服务端唯一判分入口，幂等。 */
async function submitExam(clientId, examId, rawAnswers, rawDurationSec) {
  assertExamId(examId);
  let exam = await Exam.findOne({ _id: examId, clientId });
  if (!exam) throw notFound('考试不存在');
  if (exam.status === 'submitted') {
    return { exam, alreadySubmitted: true };
  }

  const paper = new Map(exam.paper.map((item) => [item.questionId, item]));
  const questions = await Question.find({ _id: { $in: [...paper.keys()] } })
    .select('answer options type topic')
    .lean();
  const qMap = new Map(questions.map((q) => [q._id, q]));

  const submitted = new Map();
  for (const entry of rawAnswers) {
    if (!entry || typeof entry.questionId !== 'string') {
      throw badRequest('answers 项必须包含 questionId');
    }
    if (!paper.has(entry.questionId)) {
      throw badRequest(`题目 ${entry.questionId} 不属于本套试卷`);
    }
    const question = qMap.get(entry.questionId);
    if (!question) throw conflict(`题目 ${entry.questionId} 已下线`, 'QUESTION_RETIRED');
    submitted.set(entry.questionId, normalizeLetters(entry.selected, question.options.length));
  }

  let durationSec;
  if (rawDurationSec === undefined || rawDurationSec === null || rawDurationSec === '') {
    durationSec = Math.max(0, Math.round((Date.now() - exam.startedAt.getTime()) / 1000));
  } else {
    const parsed = Number(rawDurationSec);
    if (!Number.isFinite(parsed) || parsed < 0) throw badRequest('durationSec 必须是非负数');
    durationSec = Math.min(Math.round(parsed), 24 * 3600);
  }

  const answers = [];
  const topicStats = new Map(
    TOPIC_ORDER.map((key) => [key, { topic: key, name: topicName(key), total: 0, correct: 0, score: 0, maxScore: 0 }])
  );
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  for (const item of exam.paper) {
    const question = qMap.get(item.questionId);
    if (!question) {
      unansweredCount += 1;
      answers.push({ questionId: item.questionId, selected: [], correct: false });
      continue;
    }
    const selected = submitted.get(item.questionId) || [];
    const expected = [...question.answer].sort();
    const correct = selected.length > 0 && selected.join('') === expected.join('');
    const unanswered = selected.length === 0;

    if (correct) {
      correctCount += 1;
      score += item.points;
    } else if (unanswered) {
      unansweredCount += 1;
    } else {
      wrongCount += 1;
    }

    const stat = topicStats.get(item.topic);
    if (stat) {
      stat.total += 1;
      stat.maxScore += item.points;
      if (correct) {
        stat.correct += 1;
        stat.score += item.points;
      }
    }

    answers.push({ questionId: item.questionId, selected, correct });
  }

  const submittedAt = new Date();
  const byTopic = [...topicStats.values()].filter((stat) => stat.total > 0);

  // 带 status 条件更新，双击/并发重试只有一个请求能落库。
  const result = await Exam.updateOne(
    { _id: exam._id, clientId, status: 'ongoing' },
    {
      $set: {
        status: 'submitted',
        submittedAt,
        durationSec,
        answers,
        score,
        correctCount,
        wrongCount,
        unansweredCount,
        byTopic,
      },
    }
  );

  if (!result.modifiedCount) {
    exam = await Exam.findOne({ _id: examId, clientId });
    if (!exam) throw notFound('考试不存在');
    return { exam, alreadySubmitted: exam.status === 'submitted' };
  }

  // 判分成功后再写流水与错题本，失败只影响统计，不回滚已出分。
  await recordSideEffects(clientId, exam._id, answers, qMap);

  exam = await Exam.findOne({ _id: examId, clientId });
  return { exam, alreadySubmitted: false };
}

async function recordSideEffects(clientId, examId, answers, qMap) {
  const records = [];
  const wrongOps = [];

  for (const answer of answers) {
    const question = qMap.get(answer.questionId);
    if (!question) continue;
    // 未作答不写答题流水：统计里的“累计答题/正确率”只反映真正作答的题，
    // 未答数量由 exam.unansweredCount 单独承载。
    if (!answer.selected.length) continue;
    records.push({
      clientId,
      questionId: answer.questionId,
      type: question.type,
      topic: question.topic,
      selected: answer.selected,
      correct: answer.correct,
      mode: 'exam',
      examId,
    });

    // 未作答不算“错题”，但计入未答数。
    if (!answer.correct && answer.selected.length > 0) {
      wrongOps.push({
        updateOne: {
          filter: { clientId, questionId: answer.questionId },
          update: {
            $inc: { wrongCount: 1 },
            $set: {
              type: question.type,
              topic: question.topic,
              lastSelected: answer.selected,
              lastWrongAt: new Date(),
            },
            $setOnInsert: { mastered: false },
          },
          upsert: true,
        },
      });
    }
  }

  if (records.length) await AnswerRecord.insertMany(records, { ordered: false });
  if (wrongOps.length) await WrongQuestion.bulkWrite(wrongOps, { ordered: false });
}

/** 成绩报告：已交卷才可看，含答案与解析。 */
async function getExamReport(clientId, examId) {
  assertExamId(examId);
  const exam = await Exam.findOne({ _id: examId, clientId });
  if (!exam) throw notFound('考试不存在');
  if (exam.status !== 'submitted') {
    throw conflict('交卷后才能查看成绩报告', 'EXAM_NOT_SUBMITTED');
  }

  const ids = exam.paper.map((p) => p.questionId);
  const questions = await Question.find({ _id: { $in: ids } }).lean();
  const qMap = new Map(questions.map((q) => [q._id, q]));
  const answerMap = new Map(exam.answers.map((a) => [a.questionId, a]));

  const items = exam.paper
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const q = qMap.get(item.questionId);
      const answer = answerMap.get(item.questionId);
      return {
        order: item.order,
        points: item.points,
        ...(q ? toReview(q) : { id: item.questionId, type: item.type, topic: item.topic, question: '（题目已下线）', options: [], answer: [], explanation: '' }),
        selected: answer ? answer.selected : [],
        correct: answer ? answer.correct : false,
      };
    });

  return { ...examSummary(exam), items };
}

async function listExams(clientId, { page, pageSize, skip, status }) {
  const filter = { clientId };
  if (status) filter.status = status;
  const [total, docs] = await Promise.all([
    Exam.countDocuments(filter),
    Exam.find(filter).sort({ startedAt: -1 }).skip(skip).limit(pageSize).lean(),
  ]);
  return {
    items: docs.map((doc) => examSummary(doc)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

module.exports = {
  createExam,
  getExamDetail,
  submitExam,
  getExamReport,
  listExams,
  examSummary,
};
