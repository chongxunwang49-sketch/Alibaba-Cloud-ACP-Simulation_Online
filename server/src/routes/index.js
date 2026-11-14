'use strict';

const router = require('express').Router();

router.use('/health', require('./health'));
router.use('/meta', require('./meta'));
router.use('/questions', require('./questions'));
router.use('/practice', require('./practice'));
router.use('/exams', require('./exams'));
router.use('/wrong-questions', require('./wrongQuestions'));
router.use('/stats', require('./stats'));

module.exports = router;
