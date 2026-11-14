'use strict';

const router = require('express').Router();
const Question = require('../models/Question');
const asyncHandler = require('../utils/asyncHandler');
const { QUESTION_TYPES, TOPIC_KEYS } = require('../constants/topics');
const { notFound } = require('../utils/errors');
const { parsePagination, parseKeyword, assertEnum, escapeRegExp } = require('../utils/validate');
const { toPublic } = require('../services/questionService');

/** 题库分页浏览：只下发题面，不含答案与解析。 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = parsePagination(req.query);
    const type = assertEnum(req.query.type, QUESTION_TYPES, 'type');
    const topic = assertEnum(req.query.topic, TOPIC_KEYS, 'topic');
    const keyword = parseKeyword(req.query.keyword);

    const filter = {};
    if (type) filter.type = type;
    if (topic) filter.topic = topic;
    if (keyword) {
      const regex = new RegExp(escapeRegExp(keyword), 'i');
      filter.$or = [{ question: regex }, { options: regex }];
    }

    const [total, docs] = await Promise.all([
      Question.countDocuments(filter),
      Question.find(filter).sort({ _id: 1 }).skip(skip).limit(pageSize).lean(),
    ]);

    res.json({
      data: {
        items: docs.map(toPublic),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await Question.findById(req.params.id).lean();
    if (!doc) throw notFound('题目不存在');
    res.json({ data: toPublic(doc) });
  })
);

module.exports = router;
