'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireClientId } = require('../middleware/clientId');
const { examCreateLimiter, examSubmitLimiter } = require('../middleware/rateLimit');
const { parsePagination, assertEnum } = require('../utils/validate');
const { badRequest } = require('../utils/errors');
const examService = require('../services/examService');

const EXAM_STATUS = ['ongoing', 'submitted'];

/** 开考：已有进行中试卷则复用（resumed=true），否则按蓝图抽新卷。 */
router.post(
  '/',
  requireClientId,
  examCreateLimiter,
  asyncHandler(async (req, res) => {
    const { exam, resumed } = await examService.createExam(req.clientId);
    res.status(resumed ? 200 : 201).json({
      data: { ...examService.examSummary(exam), resumed },
    });
  })
);

/** 考试历史（进行中 + 已交卷），按开考时间倒序。 */
router.get(
  '/',
  requireClientId,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = parsePagination(req.query);
    const status = assertEnum(req.query.status, EXAM_STATUS, 'status');
    const data = await examService.listExams(req.clientId, { page, pageSize, skip, status });
    res.json({ data });
  })
);

router.get(
  '/:id',
  requireClientId,
  asyncHandler(async (req, res) => {
    const data = await examService.getExamDetail(req.clientId, req.params.id);
    res.json({ data });
  })
);

/** 交卷判分（幂等）。answers 缺省表示全部未答。 */
router.post(
  '/:id/submit',
  requireClientId,
  examSubmitLimiter,
  asyncHandler(async (req, res) => {
    const { answers, durationSec } = req.body || {};
    if (answers !== undefined && !Array.isArray(answers)) {
      throw badRequest('answers 必须是数组');
    }
    if (Array.isArray(answers) && answers.length > 200) {
      throw badRequest('answers 数量异常');
    }

    const { exam, alreadySubmitted } = await examService.submitExam(
      req.clientId,
      req.params.id,
      answers || [],
      durationSec
    );
    res.json({ data: { ...examService.examSummary(exam), alreadySubmitted } });
  })
);

router.get(
  '/:id/report',
  requireClientId,
  asyncHandler(async (req, res) => {
    const data = await examService.getExamReport(req.clientId, req.params.id);
    res.json({ data });
  })
);

module.exports = router;
