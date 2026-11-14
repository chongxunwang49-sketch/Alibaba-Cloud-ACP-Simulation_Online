'use strict';

const Question = require('../models/Question');
const AnswerRecord = require('../models/AnswerRecord');
const WrongQuestion = require('../models/WrongQuestion');
const { badRequest, notFound } = require('../utils/errors');
const { normalizeLetters } = require('../utils/validate');
const { toPublic, toReview } = require('./questionService');

/** 随机抽练习题（不下发答案）。 */
async function getPracticeSet({ topic, type, count }) {
  const match = {};
  if (topic) match.topic = topic;
  if (type) match.type = type;

  const docs = await Question.aggregate([
    { $match: match },
    { $sample: { size: count } },
  ]);
  return docs.map(toPublic);
}

/** 练习判分：先判对错，再落作答流水与错题本。 */
async function answerPractice(clientId, questionId, rawSelected) {
  const question = await Question.findById(questionId).lean();
  if (!question) throw notFound('题目不存在');

  const selected = normalizeLetters(rawSelected, question.options.length);
  if (!selected.length) throw badRequest('请至少选择一个选项');

  const expected = [...question.answer].sort();
  const correct = selected.join('') === expected.join('');

  await AnswerRecord.create({
    clientId,
    questionId,
    type: question.type,
    topic: question.topic,
    selected,
    correct,
    mode: 'practice',
    examId: null,
  });

  if (!correct) {
    await WrongQuestion.updateOne(
      { clientId, questionId },
      {
        $inc: { wrongCount: 1 },
        $set: {
          type: question.type,
          topic: question.topic,
          lastSelected: selected,
          lastWrongAt: new Date(),
        },
        $setOnInsert: { mastered: false },
      },
      { upsert: true }
    );
  }

  return {
    ...toReview(question),
    selected,
    correct,
  };
}

module.exports = { getPracticeSet, answerPractice };
