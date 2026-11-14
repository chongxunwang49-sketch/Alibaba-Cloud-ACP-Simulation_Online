'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { TOPICS, QUESTION_TYPES, POINTS, EXAM_BLUEPRINT } = require('../constants/topics');
const { getBankStats } = require('../services/questionService');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const bank = await getBankStats();
    const examCount = Object.values(EXAM_BLUEPRINT).reduce((sum, n) => sum + n, 0);
    const maxScore = Object.entries(EXAM_BLUEPRINT).reduce(
      (sum, [type, count]) => sum + POINTS[type] * count,
      0
    );

    res.json({
      data: {
        topics: TOPICS.map((topic) => ({ key: topic.key, name: topic.name, ratio: topic.ratio })),
        types: QUESTION_TYPES.map((type) => ({
          key: type,
          name: type === 'single' ? '单选题' : '多选题',
          points: POINTS[type],
        })),
        exam: {
          single: EXAM_BLUEPRINT.single,
          multiple: EXAM_BLUEPRINT.multiple,
          total: examCount,
          maxScore,
          durationLimitSec: null,
        },
        bank,
      },
    });
  })
);

module.exports = router;
