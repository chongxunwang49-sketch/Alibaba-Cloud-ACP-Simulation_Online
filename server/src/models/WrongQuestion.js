'use strict';

const mongoose = require('mongoose');
const { QUESTION_TYPES, TOPIC_KEYS } = require('../constants/topics');

/** 错题本聚合：同一用户同一题只保留一条，累计错误次数。 */
const wrongQuestionSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },
    questionId: { type: String, required: true },
    type: { type: String, required: true, enum: QUESTION_TYPES },
    topic: { type: String, required: true, enum: TOPIC_KEYS },
    wrongCount: { type: Number, default: 1 },
    lastSelected: { type: [String], default: [] },
    lastWrongAt: { type: Date, default: Date.now },
    mastered: { type: Boolean, default: false },
  },
  { versionKey: false, timestamps: true }
);

wrongQuestionSchema.index({ clientId: 1, questionId: 1 }, { unique: true });
wrongQuestionSchema.index({ clientId: 1, mastered: 1, lastWrongAt: -1 });
wrongQuestionSchema.index({ clientId: 1, topic: 1, type: 1 });

module.exports = mongoose.model('WrongQuestion', wrongQuestionSchema);
