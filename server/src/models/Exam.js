'use strict';

const mongoose = require('mongoose');
const { TOPIC_KEYS, QUESTION_TYPES } = require('../constants/topics');

const paperItemSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    type: { type: String, required: true, enum: QUESTION_TYPES },
    topic: { type: String, required: true, enum: TOPIC_KEYS },
    points: { type: Number, required: true },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const answerItemSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    selected: { type: [String], default: [] },
    correct: { type: Boolean, default: false },
  },
  { _id: false }
);

const topicStatSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true },
    name: { type: String, required: true },
    total: { type: Number, required: true },
    correct: { type: Number, required: true },
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * 试卷快照：题目顺序、题型、板块、分值在开考时固化。
 * 中途题库变更不影响本次复盘与判分。
 */
const examSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ['ongoing', 'submitted'],
      default: 'ongoing',
    },
    paper: { type: [paperItemSchema], required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    submittedAt: { type: Date, default: null },
    durationSec: { type: Number, default: 0 },
    answers: { type: [answerItemSchema], default: [] },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, required: true },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
    byTopic: { type: [topicStatSchema], default: [] },
  },
  {
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: false },
  }
);

examSchema.index({ clientId: 1, submittedAt: -1 });
examSchema.index({ clientId: 1, status: 1, startedAt: -1 });

module.exports = mongoose.model('Exam', examSchema);
