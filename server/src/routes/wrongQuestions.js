'use strict';

const router = require('express').Router();
const Question = require('../models/Question');
const WrongQuestion = require('../models/WrongQuestion');
const asyncHandler = require('../utils/asyncHandler');
const { requireClientId } = require('../middleware/clientId');
const { QUESTION_TYPES, TOPIC_KEYS } = require('../constants/topics');
const { parsePagination, parseBoolean, assertEnum } = require('../utils/validate');
const { badRequest, notFound } = require('../utils/errors');
const { topicName, toReview } = require('../services/questionService');

/** 错题本列表：支持 mastered/topic/type 过滤，按最近答错时间倒序。 */
router.get(
  '/',
  requireClientId,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = parsePagination(req.query);
    const topic = assertEnum(req.query.topic, TOPIC_KEYS, 'topic');
    const type = assertEnum(req.query.type, QUESTION_TYPES, 'type');
    const mastered = parseBoolean(req.query.mastered, 'mastered');

    const filter = { clientId: req.clientId };
    if (topic) filter.topic = topic;
    if (type) filter.type = type;
    if (mastered !== undefined) filter.mastered = mastered;

    const [total, rows] = await Promise.all([
      WrongQuestion.countDocuments(filter),
      WrongQuestion.find(filter).sort({ lastWrongAt: -1, _id: 1 }).skip(skip).limit(pageSize).lean(),
    ]);

    const questions = await Question.find({ _id: { $in: rows.map((row) => row.questionId) } })
      .select('question options')
      .lean();
    const qMap = new Map(questions.map((q) => [q._id, q]));

    res.json({
      data: {
        items: rows.map((row) => {
          const q = qMap.get(row.questionId);
          return {
            questionId: row.questionId,
            type: row.type,
            topic: row.topic,
            topicName: topicName(row.topic),
            question: q ? q.question : '（题目已下线）',
            options: q ? q.options : [],
            wrongCount: row.wrongCount,
            lastSelected: row.lastSelected,
            lastWrongAt: row.lastWrongAt,
            mastered: row.mastered,
          };
        }),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  })
);

/** 错题详情：含正确答案与解析，供错题本展开复习。 */
router.get(
  '/:questionId',
  requireClientId,
  asyncHandler(async (req, res) => {
    const row = await WrongQuestion.findOne({
      clientId: req.clientId,
      questionId: req.params.questionId,
    }).lean();
    if (!row) throw notFound('错题记录不存在');

    const question = await Question.findById(row.questionId).lean();
    if (!question) throw notFound('题目不存在');

    res.json({
      data: {
        ...toReview(question),
        wrongCount: row.wrongCount,
        lastSelected: row.lastSelected,
        lastWrongAt: row.lastWrongAt,
        mastered: row.mastered,
      },
    });
  })
);

/** 标记已掌握 / 撤销已掌握。 */
router.patch(
  '/:questionId',
  requireClientId,
  asyncHandler(async (req, res) => {
    const { mastered } = req.body || {};
    if (typeof mastered !== 'boolean') throw badRequest('mastered 必须是布尔值');

    const row = await WrongQuestion.findOneAndUpdate(
      { clientId: req.clientId, questionId: req.params.questionId },
      { $set: { mastered } },
      { new: true }
    );
    if (!row) throw notFound('错题记录不存在');

    res.json({ data: { questionId: row.questionId, mastered: row.mastered } });
  })
);

router.delete(
  '/:questionId',
  requireClientId,
  asyncHandler(async (req, res) => {
    const result = await WrongQuestion.deleteOne({
      clientId: req.clientId,
      questionId: req.params.questionId,
    });
    if (!result.deletedCount) throw notFound('错题记录不存在');
    res.json({ data: { questionId: req.params.questionId, deleted: true } });
  })
);

module.exports = router;
