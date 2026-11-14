'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireClientId } = require('../middleware/clientId');
const { answerLimiter } = require('../middleware/rateLimit');
const { QUESTION_TYPES, TOPIC_KEYS } = require('../constants/topics');
const { assertEnum, parseCount } = require('../utils/validate');
const { badRequest } = require('../utils/errors');
const { getPracticeSet, answerPractice } = require('../services/practiceService');

/** 随机练习卷：?topic=&type=&count=10（count 上限 50） */
router.get(
  '/set',
  asyncHandler(async (req, res) => {
    const topic = assertEnum(req.query.topic, TOPIC_KEYS, 'topic');
    const type = assertEnum(req.query.type, QUESTION_TYPES, 'type');
    const count = parseCount(req.query.count, 10, 50, 'count');
    const items = await getPracticeSet({ topic, type, count });
    res.json({ data: { items, count: items.length } });
  })
);

/** 单题作答：服务端判分，返回答案与解析。 */
router.post(
  '/answer',
  requireClientId,
  answerLimiter,
  asyncHandler(async (req, res) => {
    const { questionId, selected } = req.body || {};
    if (typeof questionId !== 'string' || !questionId.trim()) {
      throw badRequest('questionId 不能为空');
    }
    if (!Array.isArray(selected)) throw badRequest('selected 必须是字母数组，如 ["A","C"]');

    const result = await answerPractice(req.clientId, questionId.trim(), selected);
    res.json({ data: result });
  })
);

module.exports = router;
